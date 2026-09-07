import { ImapFlow } from "imapflow";
import { simpleParser, type ParsedMail, type AddressObject } from "mailparser";
import type { SupabaseClient } from "@supabase/supabase-js";
import { stripQuotes } from "./extract";
import { findOrCreateContact, isExternalAddress, resolveCounterpart } from "./link";
import { mailAccount } from "./smtp";

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
  mailbox: string;
  fetched: number;
  inserted: number;
  error?: string;
}

/** Gmail の受信トレイ・送信済みを IMAP で取り込み、顧客/担当者/問い合わせ/案件に紐付ける */
export async function syncMail(db: Db, opts: { initialDays?: number } = {}): Promise<SyncResult[]> {
  const { user, pass } = mailAccount();
  const client = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: { user, pass },
    logger: false,
  });

  const results: SyncResult[] = [];
  try {
    await client.connect();
  } catch (e) {
    const err = e as Error & { authenticationFailed?: boolean; responseText?: string };
    if (err.authenticationFailed) {
      throw new Error(
        `Gmail へのログインに失敗しました(${err.responseText ?? err.message})。` +
          "GMAIL_USER とアプリパスワードを確認してください。Google Workspace の場合は管理者が IMAP / アプリパスワードを許可している必要があります。",
      );
    }
    throw new Error(`Gmail(IMAP)への接続に失敗しました: ${err.responseText ?? err.message}`);
  }
  try {
    const { mailboxes, sentError } = await resolveMailboxes(client);
    if (sentError) results.push({ mailbox: "SENT", fetched: 0, inserted: 0, error: sentError });

    for (const mb of mailboxes) {
      const res: SyncResult = { mailbox: mb.path, fetched: 0, inserted: 0 };
      results.push(res);
      let lock;
      try {
        lock = await client.getMailboxLock(mb.path);
      } catch (e) {
        res.error = `フォルダを開けませんでした: ${(e as Error).message}`;
        continue;
      }
      try {
        const { data: state } = await db.from("mail_sync_state").select("*").eq("mailbox", mb.key).maybeSingle();
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
          const inserted = await ingestParsedMail(db, parsed, mb.direction, user, uid);
          if (inserted) res.inserted++;
          maxUid = Math.max(maxUid, uid);
        }

        await db.from("mail_sync_state").upsert({
          mailbox: mb.key,
          last_uid: maxUid,
          last_synced_at: new Date().toISOString(),
          last_error: null,
        });
      } catch (e) {
        res.error = (e as Error).message;
        await db.from("mail_sync_state").upsert({ mailbox: mb.key, last_error: res.error, last_synced_at: new Date().toISOString() });
      } finally {
        lock.release();
      }
    }
  } finally {
    await client.logout().catch(() => {});
  }
  return results;
}

/** 1通のメールを DB に登録し、顧客・担当者・問い合わせ・案件へ紐付ける。既存なら false */
export async function ingestParsedMail(
  db: Db,
  parsed: ParsedMail,
  direction: "inbound" | "outbound",
  selfAddress: string,
  imapUid?: number,
): Promise<boolean> {
  const messageId = parsed.messageId?.trim();
  if (messageId) {
    const { data: dup } = await db.from("emails").select("id").eq("message_id", messageId).maybeSingle();
    if (dup) return false;
  }

  const from = addrList(parsed.from)[0] ?? { address: "unknown", name: "" };
  const to = addrList(parsed.to);
  const cc = addrList(parsed.cc);
  const self = selfAddress.toLowerCase();

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

  // 相手が社内アドレス/自分自身なら顧客紐付けはしない
  if (counterpart && isExternalAddress(counterpart.address, self)) {
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

  const { error } = await db
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
    });
  if (error) {
    if (error.code === "23505") return false; // 重複
    throw error;
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
