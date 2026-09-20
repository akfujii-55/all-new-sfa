import { randomBytes } from "node:crypto";
import { simpleParser, type ParsedMail } from "mailparser";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { MailAccountConfig } from "./accounts";
import type { FormProfile } from "./extract";
import { connectOrThrow, imapClient, ingestParsedMail, type SyncResult } from "./sync";
import { createAdminClient } from "@/lib/supabase/server";
import type { TagRule } from "@/lib/tag-rules";

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
 * 手動転送(メールソフトの「転送」ボタン)は差出人が自社の人になり、元の差出人は本文にしか残らない。
 * 件名が Fwd: / FW: / 転送: で始まる自社発のメールに限り、本文の「From: 名前 <アドレス>」から相手を拾って受信メールとして扱う。
 */
function unwrapManualForward(parsed: ParsedMail, selves: string[]): boolean {
  const from = parsed.from?.value[0]?.address?.toLowerCase();
  if (!from || !selves.includes(from)) return false;
  if (!/^\s*(fwd?|fw|転送)\s*[::]/i.test(parsed.subject ?? "")) return false;
  const line = (parsed.text ?? "").match(/^[>\s]*(?:From|差出人|送信者)\s*[::]\s*(.+)$/im)?.[1];
  const address = line?.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i)?.[0]?.toLowerCase();
  if (!line || !address || selves.includes(address)) return false;
  const name = line.replace(/<[^>]*>|\[mailto:[^\]]*\]/gi, "").replace(address, "").replace(/["'<>]/g, "").trim();
  parsed.from = { value: [{ address, name }], text: line.trim(), html: "" };
  return true;
}

/**
 * 自テナントの転送受信アカウント宛てに届いたメールを取り込む(syncMail から呼ばれる)。
 * 他のテナント宛てのメールには触らない。
 */
export async function syncForwardAccounts(
  db: Db,
  accounts: MailAccountConfig[],
  selves: string[],
  opts: { form?: FormProfile | null; rules?: TagRule[] | null } = {},
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
    const lock = await client.getMailboxLock("INBOX");
    try {
      for (const { uid, headers } of await listPending(client)) {
        const account = tokensIn(headers, config).map((t) => byToken.get(t)).find(Boolean);
        if (!account) continue;
        const res = results.get(account.id)!;
        try {
          const msg = await client.fetchOne(String(uid), { source: true, uid: true }, { uid: true });
          if (!msg || !msg.source) continue;
          res.fetched++;
          const parsed = await simpleParser(msg.source);
          const fromSelf = lowerSelves.includes(parsed.from?.value[0]?.address?.toLowerCase() ?? "");
          const direction = fromSelf && !unwrapManualForward(parsed, lowerSelves) ? "outbound" : "inbound";
          if (await ingestParsedMail(db, parsed, direction, selves, undefined, account.id, opts.form, opts.rules)) res.inserted++;
          // 取り込み済み(重複を含む)は受信用メールボックスから消す
          await client.messageDelete(String(uid), { uid: true });
        } catch (e) {
          // 残しておけば次回の同期でやり直す
          res.error = (e as Error).message;
        }
      }
    } finally {
      lock.release();
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
 * - どのアカウントのトークンにも一致しないメール(宛先違い・削除済みアカウント宛て・迷惑メール)は既読にして、次回以降の走査から外す。
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
    const lock = await client.getMailboxLock("INBOX");
    try {
      const unknown = (await listPending(client)).filter((m) => !tokensIn(m.headers, config).some((t) => known.has(t))).map((m) => m.uid);
      if (unknown.length > 0) {
        await client.messageFlagsAdd(unknown, ["\\Seen"], { uid: true });
        result.unknown = unknown.length;
      }
      const before = new Date(Date.now() - PURGE_DAYS * 86400000);
      const old = (await client.search({ before }, { uid: true })) || [];
      if (old.length > 0) {
        await client.messageDelete(old, { uid: true });
        result.purged = old.length;
      }
    } finally {
      lock.release();
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
