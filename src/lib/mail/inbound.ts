import { randomBytes } from "node:crypto";
import { simpleParser } from "mailparser";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { MailAccountConfig } from "./accounts";
import type { FormProfile } from "./extract";
import { connectOrThrow, htmlToText, imapClient, ingestParsedMail, type SyncResult } from "./sync";
import { unwrapManualForward } from "./forward-unwrap";
import { createAdminClient } from "@/lib/supabase/server";
import type { TagRule } from "@/lib/tag-rules";
import type { IngestedMail } from "./notify";

type Db = SupabaseClient;

/**
 * メール転送による受信。
 *
 * IMAP で連携できないメールサービスの利用者は、自分のメールサーバーで「受け口アドレス」への自動転送を設定する。
 * 受け口アドレスは全テナント共通の受信用メールボックス(運営側が用意、環境変数 INBOUND_*)に届き、
 * 宛先に含まれるトークン(mail_accounts.inbound_token)でどのテナントのどのアカウント宛てかを決める。
 *
 * - サーバーの自動転送は From / To / Message-ID が元のまま届くので、取り込みは IMAP と同じ ingestParsedMail を使う。
 * - 取り込めたメールは受信用メールボックスから消す(自前の箱なので UID の追跡は不要)。失敗したものは残して次回やり直す。
 * - 送信済みメールは転送では届かない。普段のメールソフトから送るときに受け口アドレスを BCC に入れてもらうと、
 *   差出人が自社アドレスのメールとして届くので outbound で記録する。
 */

export interface InboundConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  /** 受け口アドレスの形。{token} がトークンに置き換わる(例: t-{token}@in.example.jp / inbox+{token}@example.jp) */
  addressFormat: string;
}

const TOKEN_RE = "[a-z0-9]{20}";
/** どのテナント宛てでもないまま残ったメールを消すまでの日数 */
const PURGE_DAYS = 30;

/** 受信用メールボックスの設定。環境変数が揃っていなければ null(転送による受信は選べない) */
export function inboundConfig(): InboundConfig | null {
  const host = process.env.INBOUND_IMAP_HOST?.trim();
  const user = process.env.INBOUND_IMAP_USER?.trim();
  // Google のアプリパスワードは 4 桁ごとに空白入りで表示されるので、メールアカウントの保存時と同じく空白を除く
  const password = process.env.INBOUND_IMAP_PASSWORD?.replace(/\s+/g, "");
  const addressFormat = process.env.INBOUND_ADDRESS_FORMAT?.trim().toLowerCase();
  if (!host || !user || !password || !addressFormat?.includes("{token}") || !addressFormat.includes("@")) return null;
  return { host, port: Number(process.env.INBOUND_IMAP_PORT) || 993, user, password, addressFormat };
}

export function generateInboundToken() {
  // 20 文字の英小文字 + 数字(約 100 ビット)。受け口アドレスを知らない第三者がメールを送り込めないようにする
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from(randomBytes(20), (b) => chars[b % chars.length]).join("");
}

/** トークンから受け口アドレスを作る。受信用メールボックスが未設定なら null */
export function inboundAddress(token: string | null | undefined): string | null {
  const config = inboundConfig();
  return config && token ? config.addressFormat.replace("{token}", token) : null;
}

/** ヘッダー全体から受け口アドレスのトークンを拾う(Delivered-To / X-Original-To / Received の for / To など、サーバーごとに入る場所が違うため) */
function tokensIn(headers: string, config: InboundConfig): string[] {
  const escaped = config.addressFormat.replace(/[.*+?^$()|[\]\\]/g, "\\$&").replace("{token}", `(${TOKEN_RE})`);
  const re = new RegExp(`(?<![a-z0-9])${escaped}`, "gi");
  const unfolded = headers.replace(/\r?\n[ \t]+/g, " ");
  return [...new Set([...unfolded.matchAll(re)].map((m) => m[1].toLowerCase()))];
}

function mailboxClient(config: InboundConfig) {
  return imapClient({ imapHost: config.host, imapPort: config.port, loginUser: config.user, password: config.password });
}

/**
 * 走査するフォルダ(受信トレイと迷惑メール)と、処理済みを捨てる先(ゴミ箱)。
 * 転送されたメールは差出人の認証(SPF / DMARC)が崩れて迷惑メールに振り分けられやすいが、
 * 受け口アドレスのトークンを知っている相手からしか届かないので、迷惑メールに入っていても取り込んでよい。
 * 捨てるときは削除ではなくゴミ箱へ移す: Gmail は受信トレイで削除したメールを「すべてのメール」に残し続けるため
 * (ゴミ箱に入れれば 30 日で自動的に消える)。ゴミ箱の無いサーバーでは削除する。
 */
async function inboundMailboxes(client: ReturnType<typeof mailboxClient>): Promise<{ scan: string[]; trash: string | null }> {
  const scan = ["INBOX"];
  let trash: string | null = null;
  try {
    const list = await client.list();
    const junk = list.find((m) => m.specialUse === "\\Junk")?.path;
    if (junk) scan.push(junk);
    trash = list.find((m) => m.specialUse === "\\Trash")?.path ?? null;
  } catch {
    // フォルダ一覧が取れなくても受信トレイだけは見る
  }
  return { scan, trash };
}

/** 処理済みのメールを受信用メールボックスから捨てる(ゴミ箱があれば移動、無ければ削除) */
async function discard(client: ReturnType<typeof mailboxClient>, uids: number[] | string, trash: string | null) {
  if (trash) await client.messageMove(uids, trash, { uid: true });
  else await client.messageDelete(uids, { uid: true });
}

/** 受信用メールボックスの未処理メール(未読)の UID とヘッダーを集める。fetch の途中では他のコマンドを送れないので先に全部読む */
async function listPending(client: ReturnType<typeof mailboxClient>): Promise<{ uid: number; headers: string }[]> {
  const uids = (await client.search({ seen: false }, { uid: true })) || [];
  const pending: { uid: number; headers: string }[] = [];
  if (uids.length === 0) return pending;
  for await (const msg of client.fetch(uids, { uid: true, headers: true }, { uid: true })) {
    pending.push({ uid: msg.uid, headers: msg.headers?.toString("utf8") ?? "" });
  }
  return pending.sort((a, b) => a.uid - b.uid);
}

/**
 * 自テナントの転送受信アカウント宛てに届いたメールを取り込む(syncMail から呼ばれる)。
 * 他のテナント宛てのメールには触らない。
 */
export async function syncForwardAccounts(
  db: Db,
  accounts: MailAccountConfig[],
  selves: string[],
  opts: { form?: FormProfile | null; rules?: TagRule[] | null; collect?: IngestedMail[] } = {},
): Promise<SyncResult[]> {
  const results = new Map(accounts.map((a) => [a.id, { account: a.email, mailbox: "転送", fetched: 0, inserted: 0 } as SyncResult]));
  const out = () => [...results.values()];
  const config = inboundConfig();
  if (!config) {
    for (const r of results.values()) r.error = "転送メールの受信用メールボックスが設定されていません(運営にお問い合わせください)";
    return out();
  }
  const byToken = new Map(accounts.filter((a) => a.inboundToken).map((a) => [a.inboundToken!, a]));
  const lowerSelves = selves.map((s) => s.toLowerCase());

  const client = mailboxClient(config);
  await connectOrThrow(client, "転送メールの受信用メールボックス");
  try {
    const { scan, trash } = await inboundMailboxes(client);
    for (const path of scan) {
      const lock = await client.getMailboxLock(path);
      try {
        for (const { uid, headers } of await listPending(client)) {
          const tokens = tokensIn(headers, config);
          const account = tokens.map((t) => byToken.get(t)).find(Boolean);
          if (!account) continue;
          // 受け口アドレス(古いトークンも含む)は自社側として扱い、送信の控えで相手として登録されないようにする
          const selvesHere = [...selves, ...tokens.map((t) => config.addressFormat.replace("{token}", t))];
          const res = results.get(account.id)!;
          try {
            const msg = await client.fetchOne(String(uid), { source: true, uid: true }, { uid: true });
            if (!msg || !msg.source) continue;
            res.fetched++;
            const parsed = await simpleParser(msg.source);
            const fromSelf = lowerSelves.includes(parsed.from?.value[0]?.address?.toLowerCase() ?? "");
            // 自社発のメール: 手動転送(Fwd:)なら本文の差出人を相手にして受信、それ以外は BCC の控えとして送信
            const bodyText = parsed.text ?? (parsed.html ? htmlToText(parsed.html) : "");
            const direction = fromSelf && !unwrapManualForward(parsed, lowerSelves, bodyText) ? "outbound" : "inbound";
            const inserted = await ingestParsedMail(db, parsed, direction, selvesHere, undefined, account.id, opts.form, opts.rules);
            if (inserted) {
              res.inserted++;
              opts.collect?.push(inserted);
            }
            // 取り込み済み(重複を含む)は受信用メールボックスから捨てる
            await discard(client, String(uid), trash);
          } catch (e) {
            // 残しておけば次回の同期でやり直す
            res.error = (e as Error).message;
          }
        }
      } finally {
        lock.release();
      }
    }
  } finally {
    await client.logout().catch(() => {});
  }
  return out();
}

export interface InboundCleanupResult {
  /** どのアカウントのトークンにも一致せず、既読にして保留したメール数 */
  unknown: number;
  /** 古くなって消したメール数 */
  purged: number;
}

/**
 * 受信用メールボックスの掃除(cron から 1 日 1 回)。
 * - 受信トレイと迷惑メールの両方を対象に、どのアカウントのトークンにも一致しないメール(宛先違い・削除済みアカウント宛て・迷惑メール)は既読にして、次回以降の走査から外す。
 * - 利用停止中のテナント宛てなどで取り込まれないまま PURGE_DAYS を過ぎたメールは消す。
 * トークンの照合はテナントをまたぐので service role で mail_accounts の inbound_token だけを読む(業務データは読み書きしない)。
 */
export async function cleanupInboundMailbox(): Promise<InboundCleanupResult | null> {
  const config = inboundConfig();
  if (!config) return null;
  const { data, error } = await createAdminClient().from("mail_accounts").select("inbound_token").not("inbound_token", "is", null);
  if (error) throw new Error(`受け口アドレスの一覧を取得できません: ${error.message}`);
  const known = new Set((data ?? []).map((r) => r.inbound_token as string));

  const result: InboundCleanupResult = { unknown: 0, purged: 0 };
  const client = mailboxClient(config);
  await connectOrThrow(client, "転送メールの受信用メールボックス");
  try {
    const { scan, trash } = await inboundMailboxes(client);
    for (const path of scan) {
      const lock = await client.getMailboxLock(path);
      try {
        const unknown = (await listPending(client)).filter((m) => !tokensIn(m.headers, config).some((t) => known.has(t))).map((m) => m.uid);
        if (unknown.length > 0) {
          await client.messageFlagsAdd(unknown, ["\\Seen"], { uid: true });
          result.unknown += unknown.length;
        }
        const before = new Date(Date.now() - PURGE_DAYS * 86400000);
        const old = (await client.search({ before }, { uid: true })) || [];
        if (old.length > 0) {
          await discard(client, old, trash);
          result.purged += old.length;
        }
      } finally {
        lock.release();
      }
    }
  } finally {
    await client.logout().catch(() => {});
  }
  return result;
}

/** 受信用メールボックスにログインできるか(ヘルスチェック用) */
export async function verifyInboundMailbox() {
  const config = inboundConfig();
  if (!config) return;
  const client = mailboxClient(config);
  await connectOrThrow(client, "転送メールの受信用メールボックス");
  await client.logout().catch(() => {});
}
