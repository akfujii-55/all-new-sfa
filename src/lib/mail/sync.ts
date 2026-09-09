import { ImapFlow } from "imapflow";
import { simpleParser, type ParsedMail, type AddressObject } from "mailparser";
import type { SupabaseClient } from "@supabase/supabase-js";
import { stripQuotes } from "./extract";
import { findOrCreateContact, isExternalAddress, isSystemAddress, resolveCounterpart } from "./link";
import { listMailAccounts, type MailAccountConfig } from "./accounts";
import { saveAttachments } from "./attachments";
import { errorDetail, logSystem } from "@/lib/log";

type Db = SupabaseClient;

type Mailbox = { key: string; path: string; direction: "inbound" | "outbound" };

/**
 * 同期対象のメールボックスを解決する。
 * 送信済みフォルダは Gmail の表示言語でパスが変わる(例: "[Gmail]/Sent Mail" / "[Gmail]/送信済みメール")ため、
 * 名前を固定せず SPECIAL-USE の \Sent フラグから探す。
 * key は mail_sync_state の主キーとして使う安定した識別子。
 */
async function resolveMailboxes(client: ImapFlow): Promise<{ mailboxes: Mailbox[]; sentError?: string }> {
  const mailboxes: Mailbox[] = [{ key: "INBOX", path: "INBOX", direction: "inbound" }];
  try {
    const list = await client.list();
    const sent = list.find((m) => m.specialUse === "\\Sent");
    if (sent) {
      mailboxes.push({ key: "SENT", path: sent.path, direction: "outbound" });
      return { mailboxes };
    }
    return { mailboxes, sentError: "送信済みメールのフォルダが見つかりません(Gmail の設定で IMAP に表示されているか確認してください)" };
  } catch (e) {
    return { mailboxes, sentError: `フォルダ一覧の取得に失敗しました: ${(e as Error).message}` };
  }
}

function addrList(a: AddressObject | AddressObject[] | undefined): { address: string; name: string }[] {
  if (!a) return [];
  const arr = Array.isArray(a) ? a : [a];
  return arr.flatMap((x) => x.value.map((v) => ({ address: (v.address ?? "").toLowerCase(), name: v.name ?? "" })));
}

function refs(parsed: ParsedMail): string[] {
  const r = parsed.references;
  if (!r) return [];
  return Array.isArray(r) ? r : [r];
}

export function threadKeyOf(messageId: string | undefined, inReplyTo: string | undefined, references: string[]) {
  return references[0] || inReplyTo || messageId || `gen-${crypto.randomUUID()}`;
}

export interface SyncResult {
  /** アカウントのメールアドレス */
  account: string;
  mailbox: string;
  fetched: number;
  inserted: number;
  error?: string;
}

/** 登録済みの全アカウントを IMAP で取り込み、顧客/担当者/問い合わせ/案件に紐付ける */
export async function syncMail(db: Db, opts: { initialDays?: number; accountId?: string } = {}): Promise<SyncResult[]> {
  let accounts = await listMailAccounts(db);
  if (opts.accountId) accounts = accounts.filter((a) => a.id === opts.accountId);
  if (accounts.length === 0) throw new Error("メールアカウントが設定されていません。設定画面から追加してください。");
  const selves = accounts.map((a) => a.email);

  const results: SyncResult[] = [];
  for (const account of accounts) {
    try {
      results.push(...(await syncAccount(db, account, selves, opts)));
      await db.from("mail_accounts").update({ last_error: null }).eq("id", account.id);
    } catch (e) {
      const message = (e as Error).message;
      results.push({ account: account.email, mailbox: "-", fetched: 0, inserted: 0, error: message });
      await db.from("mail_accounts").update({ last_error: message }).eq("id", account.id);
      await logSystem(
        { source: "mail.sync", message: `メール同期に失敗(${account.email}): ${message}`, detail: { ...errorDetail(e), account: account.email } },
        db,
      );
    }
  }
  // フォルダ単位の失敗(アカウント自体には接続できたもの)も記録する
  for (const r of results) {
    if (r.error && r.mailbox !== "-") {
      await logSystem({ source: "mail.sync", message: `メール同期でエラー(${r.account} ${r.mailbox}): ${r.error}`, detail: { ...r } }, db);
    }
  }
  return results;
}

/** IMAP にログインできるか確認する(設定画面の接続テスト用) */
export async function verifyImap(account: MailAccountConfig) {
  const client = imapClient(account);
  await connectOrThrow(client);
  await client.logout().catch(() => {});
}

function imapClient(account: MailAccountConfig) {
  return new ImapFlow({
    host: account.imapHost,
    port: account.imapPort,
    secure: account.imapPort === 993,
    auth: { user: account.email, pass: account.password },
    logger: false,
  });
}

async function connectOrThrow(client: ImapFlow) {
  try {
    await client.connect();
  } catch (e) {
    const err = e as Error & { authenticationFailed?: boolean; responseText?: string };
    if (err.authenticationFailed) {
      throw new Error(
        `メールサーバーへのログインに失敗しました(${err.responseText ?? err.message})。` +
          "メールアドレスとアプリパスワードを確認してください。Google Workspace の場合は管理者が IMAP / アプリパスワードを許可している必要があります。",
      );
    }
    throw new Error(`メールサーバー(IMAP)への接続に失敗しました: ${err.responseText ?? err.message}`);
  }
}

async function syncAccount(
  db: Db,
  account: MailAccountConfig,
  selves: string[],
  opts: { initialDays?: number },
): Promise<SyncResult[]> {
  const client = imapClient(account);
  const results: SyncResult[] = [];
  await connectOrThrow(client);
  try {
    const { mailboxes, sentError } = await resolveMailboxes(client);
    if (sentError) results.push({ account: account.email, mailbox: "SENT", fetched: 0, inserted: 0, error: sentError });

    for (const mb of mailboxes) {
      const res: SyncResult = { account: account.email, mailbox: mb.path, fetched: 0, inserted: 0 };
      results.push(res);
      let lock;
      try {
        lock = await client.getMailboxLock(mb.path);
      } catch (e) {
        res.error = `フォルダを開けませんでした: ${(e as Error).message}`;
        continue;
      }
      try {
        const { data: state } = await db
          .from("mail_sync_state")
          .select("*")
          .eq("account_id", account.id)
          .eq("mailbox", mb.key)
          .maybeSingle();
        const lastUid = Number(state?.last_uid ?? 0);

        let uids: number[];
        if (lastUid > 0) {
          uids = ((await client.search({ uid: `${lastUid + 1}:*` }, { uid: true })) || []).filter((u) => u > lastUid);
        } else {
          const since = new Date();
          since.setDate(since.getDate() - (opts.initialDays ?? 30));
          uids = (await client.search({ since }, { uid: true })) || [];
        }
        uids.sort((a, b) => a - b);
        let maxUid = lastUid;

        for (const uid of uids) {
          const msg = await client.fetchOne(String(uid), { source: true, uid: true }, { uid: true });
          if (!msg || !msg.source) continue;
          res.fetched++;
          const parsed = await simpleParser(msg.source);
          const inserted = await ingestParsedMail(db, parsed, mb.direction, selves, uid, account.id);
          if (inserted) res.inserted++;
          maxUid = Math.max(maxUid, uid);
        }

        await db.from("mail_sync_state").upsert(
          { account_id: account.id, mailbox: mb.key, last_uid: maxUid, last_synced_at: new Date().toISOString(), last_error: null },
          { onConflict: "account_id,mailbox" },
        );
      } catch (e) {
        res.error = (e as Error).message;
        await db.from("mail_sync_state").upsert(
          { account_id: account.id, mailbox: mb.key, last_error: res.error, last_synced_at: new Date().toISOString() },
          { onConflict: "account_id,mailbox" },
        );
      } finally {
        lock.release();
      }
    }
  } finally {
    await client.logout().catch(() => {});
  }
  return results;
}

export interface BackfillResult {
  account: string;
  mailbox: string;
  /** 添付なしで登録済みだったため IMAP から再取得したメール数 */
  checked: number;
  /** 添付ファイルを保存できたメール数 */
  saved: number;
  error?: string;
}

/**
 * 添付ファイル対応より前に取り込んだメールについて、IMAP から本文を再取得して添付だけを保存する。
 * DB に登録済み(message_id が一致)かつ添付が1件もないメールが対象。
 */
export async function backfillAttachments(db: Db, opts: { days?: number; accountId?: string } = {}): Promise<BackfillResult[]> {
  let accounts = await listMailAccounts(db);
  if (opts.accountId) accounts = accounts.filter((a) => a.id === opts.accountId);
  const results: BackfillResult[] = [];
  const since = new Date();
  since.setDate(since.getDate() - (opts.days ?? 90));

  for (const account of accounts) {
    const client = imapClient(account);
    try {
      await connectOrThrow(client);
    } catch (e) {
      results.push({ account: account.email, mailbox: "-", checked: 0, saved: 0, error: (e as Error).message });
      continue;
    }
    try {
      const { mailboxes } = await resolveMailboxes(client);
      for (const mb of mailboxes) {
        const res: BackfillResult = { account: account.email, mailbox: mb.path, checked: 0, saved: 0 };
        results.push(res);
        let lock;
        try {
          lock = await client.getMailboxLock(mb.path);
        } catch (e) {
          res.error = `フォルダを開けませんでした: ${(e as Error).message}`;
          continue;
        }
        try {
          const uids = (await client.search({ since }, { uid: true })) || [];
          if (uids.length === 0) continue;

          // まずヘッダだけ取って message_id → uid の対応を作る
          const byMessageId = new Map<string, number>();
          for await (const msg of client.fetch(uids, { envelope: true, uid: true }, { uid: true })) {
            const mid = msg.envelope?.messageId?.trim();
            if (mid) byMessageId.set(mid, msg.uid);
          }
          if (byMessageId.size === 0) continue;

          // DB にあって添付が未保存のものだけ本文を再取得する
          const targets: { id: string; uid: number }[] = [];
          const ids = [...byMessageId.keys()];
          for (let i = 0; i < ids.length; i += 200) {
            const { data } = await db
              .from("emails")
              .select("id, message_id, attachments:email_attachments(count)")
              .in("message_id", ids.slice(i, i + 200));
            for (const row of (data ?? []) as unknown as { id: string; message_id: string; attachments: { count: number }[] }[]) {
              if ((row.attachments?.[0]?.count ?? 0) > 0) continue;
              const uid = byMessageId.get(row.message_id);
              if (uid) targets.push({ id: row.id, uid });
            }
          }

          for (const t of targets) {
            const msg = await client.fetchOne(String(t.uid), { source: true, uid: true }, { uid: true });
            if (!msg || !msg.source) continue;
            res.checked++;
            const parsed = await simpleParser(msg.source);
            if (!parsed.attachments?.length) continue;
            try {
              if ((await saveAttachments(db, t.id, parsed.attachments)) > 0) res.saved++;
            } catch (e) {
              console.error("[mail/backfill] attachments", (e as Error).message);
            }
          }
        } catch (e) {
          res.error = (e as Error).message;
        } finally {
          lock.release();
        }
      }
    } finally {
      await client.logout().catch(() => {});
    }
  }
  return results;
}

/** 1通のメールを DB に登録し、顧客・担当者・問い合わせ・案件へ紐付ける。既存なら false */
export async function ingestParsedMail(
  db: Db,
  parsed: ParsedMail,
  direction: "inbound" | "outbound",
  /** 自社のメールアドレス(登録済みアカウント全部) */
  selfAddresses: string | string[],
  imapUid?: number,
  accountId?: string | null,
): Promise<boolean> {
  const messageId = parsed.messageId?.trim();
  if (messageId) {
    const { data: dup } = await db.from("emails").select("id").eq("message_id", messageId).maybeSingle();
    if (dup) return false;
  }

  const from = addrList(parsed.from)[0] ?? { address: "unknown", name: "" };
  const to = addrList(parsed.to);
  const cc = addrList(parsed.cc);
  const self = (Array.isArray(selfAddresses) ? selfAddresses : [selfAddresses]).map((a) => a.toLowerCase());

  const text = parsed.text ?? (parsed.html ? htmlToText(parsed.html) : "");
  // 相手(顧客側)を決める。自社サイトのフォーム通知なら本文の問い合わせ者本人
  const { counterpart } = resolveCounterpart({ direction, from, to, cc, self, text });

  const references = refs(parsed);
  const inReplyTo = parsed.inReplyTo?.trim() || undefined;
  const threadKey = threadKeyOf(messageId, inReplyTo, references);

  // 同一スレッドの既存メールから紐付けを引き継ぐ
  const { data: sibling } = await db
    .from("emails")
    .select("company_id, contact_id, deal_id, inquiry_id, thread_key")
    .or(`thread_key.eq.${escapeOr(threadKey)}${inReplyTo ? `,message_id.eq.${escapeOr(inReplyTo)}` : ""}`)
    .order("received_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  let companyId: string | null = sibling?.company_id ?? null;
  let contactId: string | null = sibling?.contact_id ?? null;
  let dealId: string | null = sibling?.deal_id ?? null;
  const inquiryId: string | null = sibling?.inquiry_id ?? null;
  const effectiveThreadKey = sibling?.thread_key ?? threadKey;

  // 相手が社内アドレス/自分自身、または配送エラー通知・no-reply などのシステム送信元なら顧客紐付けはしない
  if (counterpart && isExternalAddress(counterpart.address, self) && !isSystemAddress(counterpart.address)) {
    if (!contactId) {
      const linked = await findOrCreateContact(db, { counterpart, direction, subject: parsed.subject ?? null, text, companyId });
      contactId = linked.contactId;
      companyId = linked.companyId;
    }
    if (!companyId && contactId) {
      const { data: c } = await db.from("contacts").select("company_id").eq("id", contactId).maybeSingle();
      companyId = c?.company_id ?? null;
    }

    // 進行中の案件があれば紐付け(スレッドで未確定の場合)
    if (!dealId && contactId) {
      const { data: openDeal } = await db
        .from("deals")
        .select("id")
        .eq("contact_id", contactId)
        .not("stage", "in", '("won","lost")')
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      dealId = openDeal?.id ?? null;
    }
  }

  const snippet = stripQuotes(text).replace(/\s+/g, " ").slice(0, 160);
  const receivedAt = (parsed.date ?? new Date()).toISOString();

  const { data: row, error } = await db
    .from("emails")
    .insert({
      message_id: messageId ?? null,
      thread_key: effectiveThreadKey,
      in_reply_to: inReplyTo ?? null,
      direction,
      from_address: from.address,
      from_name: from.name || null,
      to_addresses: to.map((t) => t.address),
      cc_addresses: cc.map((c) => c.address),
      subject: parsed.subject ?? null,
      text_body: text,
      html_body: parsed.html || null,
      snippet,
      received_at: receivedAt,
      company_id: companyId,
      contact_id: contactId,
      deal_id: dealId,
      inquiry_id: inquiryId,
      is_read: direction === "outbound",
      imap_uid: imapUid ?? null,
      account_id: accountId ?? null,
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") return false; // 重複
    throw error;
  }

  // 添付ファイルは Storage に保存。失敗してもメール本体の登録は成立させ、同期全体を止めない
  if (parsed.attachments?.length) {
    try {
      await saveAttachments(db, row.id, parsed.attachments);
    } catch (e) {
      console.error("[mail/sync] attachments", (e as Error).message);
    }
  }

  // 問い合わせは自動登録しない。メール画面でユーザーが選択したものだけを
  // createInquiriesFromEmails(src/actions/inquiries.ts)で登録する。
  // 既存スレッドに問い合わせが付いていれば sibling から inquiry_id を引き継ぐ。
  return true;
}

function escapeOr(v: string) {
  // PostgREST の or() フィルタ用にカンマ・括弧を含む値をダブルクォートで囲む
  return `"${v.replace(/"/g, '\\"')}"`;
}

export function htmlToText(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
