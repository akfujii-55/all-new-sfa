import { ImapFlow } from "imapflow";
import { simpleParser, type ParsedMail, type AddressObject } from "mailparser";
import type { SupabaseClient } from "@supabase/supabase-js";
import { extractFromEmail, isFreeMail, stripQuotes } from "./extract";
import { mailAccount } from "./smtp";

type Db = SupabaseClient;

const MAILBOXES: { name: string; direction: "inbound" | "outbound" }[] = [
  { name: "INBOX", direction: "inbound" },
  { name: "[Gmail]/Sent Mail", direction: "outbound" },
];

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
  await client.connect();
  try {
    for (const mb of MAILBOXES) {
      const res: SyncResult = { mailbox: mb.name, fetched: 0, inserted: 0 };
      results.push(res);
      let lock;
      try {
        lock = await client.getMailboxLock(mb.name);
      } catch (e) {
        res.error = `mailbox open failed: ${(e as Error).message}`;
        continue;
      }
      try {
        const { data: state } = await db.from("mail_sync_state").select("*").eq("mailbox", mb.name).maybeSingle();
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
          mailbox: mb.name,
          last_uid: maxUid,
          last_synced_at: new Date().toISOString(),
          last_error: null,
        });
      } catch (e) {
        res.error = (e as Error).message;
        await db.from("mail_sync_state").upsert({ mailbox: mb.name, last_error: res.error, last_synced_at: new Date().toISOString() });
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

  // 相手(顧客側)のアドレスを決める
  const counterpart =
    direction === "inbound"
      ? from
      : (to.find((t) => t.address && t.address !== self) ?? cc.find((c) => c.address !== self) ?? null);

  const text = parsed.text ?? (parsed.html ? htmlToText(parsed.html) : "");
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
  const isExternal = counterpart && counterpart.address && counterpart.address !== self && !counterpart.address.endsWith(`@${self.split("@")[1]}`);

  let extracted: Awaited<ReturnType<typeof extractFromEmail>> | null = null;
  if (isExternal && counterpart) {
    if (!contactId) {
      const { data: existing } = await db
        .from("contacts")
        .select("id, company_id")
        .eq("email", counterpart.address)
        .maybeSingle();
      if (existing) {
        contactId = existing.id;
        companyId = companyId ?? existing.company_id;
      } else {
        if (direction === "inbound") {
          extracted = await extractFromEmail({
            fromName: from.name || null,
            fromAddress: from.address,
            subject: parsed.subject ?? null,
            text,
          });
        }
        const domain = counterpart.address.split("@")[1] ?? "";
        if (!companyId) {
          companyId = await findOrCreateCompany(db, domain, extracted?.company_name ?? null, counterpart.name || extracted?.person_name || null);
        }
        const { data: created } = await db
          .from("contacts")
          .insert({
            company_id: companyId,
            name: extracted?.person_name || counterpart.name || counterpart.address.split("@")[0],
            email: counterpart.address,
            title: extracted?.person_title ?? null,
            phone: extracted?.phone ?? null,
          })
          .select("id")
          .single();
        contactId = created?.id ?? null;
      }
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

  const { data: email, error } = await db
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
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") return false; // 重複
    throw error;
  }

  // 新規スレッドの受信メールは問い合わせとして登録
  if (direction === "inbound" && isExternal && !inquiryId && !sibling && email) {
    if (!extracted) {
      extracted = await extractFromEmail({
        fromName: from.name || null,
        fromAddress: from.address,
        subject: parsed.subject ?? null,
        text,
      });
    }
    const { data: inq } = await db
      .from("inquiries")
      .insert({
        company_id: companyId,
        contact_id: contactId,
        email_id: email.id,
        deal_id: dealId,
        subject: parsed.subject || "(件名なし)",
        summary: extracted.summary,
        category: extracted.category,
        status: dealId ? "converted" : "new",
        received_at: receivedAt,
      })
      .select("id")
      .single();
    if (inq) {
      await db.from("emails").update({ inquiry_id: inq.id }).eq("id", email.id);
    }
  }
  return true;
}

async function findOrCreateCompany(db: Db, domain: string, extractedName: string | null, personName: string | null) {
  const free = !domain || isFreeMail(domain);
  if (!free) {
    const { data: byDomain } = await db.from("companies").select("id").eq("domain", domain).maybeSingle();
    if (byDomain) return byDomain.id;
  }
  if (extractedName) {
    const { data: byName } = await db.from("companies").select("id").eq("name", extractedName).maybeSingle();
    if (byName) {
      if (!free) await db.from("companies").update({ domain }).eq("id", byName.id).is("domain", null);
      return byName.id;
    }
  }
  const name = extractedName || (free ? `${personName ?? domain}(個人)` : domainToName(domain));
  const { data: created } = await db
    .from("companies")
    .insert({ name, domain: free ? null : domain, website: free ? null : `https://${domain}` })
    .select("id")
    .single();
  return created?.id ?? null;
}

function domainToName(domain: string) {
  const base = domain.split(".")[0] ?? domain;
  return base.charAt(0).toUpperCase() + base.slice(1);
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
