/**
 * 問い合わせフォームの通知メール(送信元が通知システム)を、本文に書かれた問い合わせ者本人の
 * 担当者・取引先に紐付け直す修復スクリプト。
 *
 *   npx tsx scripts/relink-form-emails.mts            # 変更内容の表示のみ(dry-run)
 *   npx tsx scripts/relink-form-emails.mts --apply    # 実際に更新する
 *
 * 対象: 受信メールのうち parseFormNotification で問い合わせ者のアドレスが取れ、
 *       それが送信元アドレスと異なるもの。
 * 更新: emails.contact_id / company_id、そのメールに紐付く inquiries、
 *       その問い合わせから作られた deals(担当者未設定または旧担当者のもの)。
 *       参照が無くなった通知システム由来の担当者・取引先は削除する。
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { parseFormNotification } from "../src/lib/mail/extract";
import { findOrCreateContact, isExternalAddress } from "../src/lib/mail/link";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}
const apply = process.argv.includes("--apply");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const self = (process.env.GMAIL_USER ?? "").toLowerCase();
if (!url || !key || !self) throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / GMAIL_USER が必要です");
const db = createClient(url, key);

const { data: emails, error } = await db
  .from("emails")
  .select("id, from_address, from_name, subject, text_body, contact_id, company_id, inquiry_id, deal_id, received_at")
  .eq("direction", "inbound")
  .order("received_at");
if (error) throw error;

const oldContacts = new Set<string>();
const oldCompanies = new Set<string>();
let changed = 0;

for (const e of emails ?? []) {
  const form = parseFormNotification(e.text_body ?? "");
  if (!form || form.email === e.from_address.toLowerCase()) continue;
  if (!isExternalAddress(form.email, self)) continue;

  console.log(`\n# ${e.received_at.slice(0, 16)} ${e.subject?.slice(0, 50)}`);
  console.log(`  送信元 ${e.from_address} → 問い合わせ者 ${form.name ?? "?"} <${form.email}> / ${form.company ?? "(会社名なし)"}`);
  if (!apply) { console.log("  (dry-run) 担当者・取引先を作成/特定して紐付け直します"); continue; }

  const linked = await findOrCreateContact(db, {
    counterpart: { address: form.email, name: form.name ?? "" },
    direction: "inbound",
    subject: e.subject,
    text: e.text_body ?? "",
  });
  if (!linked.contactId) { console.log("  !! 担当者を作成できませんでした"); continue; }
  if (linked.contactId === e.contact_id) { console.log("  既に正しく紐付いています"); continue; }

  if (e.contact_id) oldContacts.add(e.contact_id);
  if (e.company_id) oldCompanies.add(e.company_id);

  await db.from("emails").update({ contact_id: linked.contactId, company_id: linked.companyId }).eq("id", e.id);
  console.log(`  emails を更新 contact=${linked.contactId.slice(0, 8)} company=${linked.companyId?.slice(0, 8)}`);

  if (e.inquiry_id) {
    const { data: inq } = await db.from("inquiries").select("id, contact_id, company_id, deal_id").eq("id", e.inquiry_id).maybeSingle();
    if (inq) {
      await db.from("inquiries").update({ contact_id: linked.contactId, company_id: linked.companyId }).eq("id", inq.id);
      console.log(`  inquiries を更新`);
      if (inq.deal_id) {
        const { data: deal } = await db.from("deals").select("id, title, contact_id, company_id").eq("id", inq.deal_id).maybeSingle();
        // 担当者が未設定、または旧(通知システム由来)の担当者のままの案件だけ直す
        if (deal && (!deal.contact_id || deal.contact_id === e.contact_id)) {
          await db.from("deals").update({ contact_id: linked.contactId, company_id: linked.companyId }).eq("id", deal.id);
          console.log(`  deals「${deal.title}」の担当者・取引先を更新`);
        } else if (deal) {
          console.log(`  deals「${deal.title}」は担当者が手動設定済みのため変更しません`);
        }
      }
    }
  }
  changed++;
}

if (apply) {
  // 参照が残っていない通知システム由来の担当者・取引先を削除
  for (const cid of oldContacts) {
    const [{ count: em }, { count: dl }, { count: iq }] = await Promise.all([
      db.from("emails").select("id", { count: "exact", head: true }).eq("contact_id", cid),
      db.from("deals").select("id", { count: "exact", head: true }).eq("contact_id", cid),
      db.from("inquiries").select("id", { count: "exact", head: true }).eq("contact_id", cid),
    ]);
    if ((em ?? 0) + (dl ?? 0) + (iq ?? 0) === 0) {
      const { data: c } = await db.from("contacts").select("name, email").eq("id", cid).maybeSingle();
      await db.from("contacts").delete().eq("id", cid);
      console.log(`\n参照の無くなった担当者を削除: ${c?.name} <${c?.email}>`);
    }
  }
  for (const coid of oldCompanies) {
    const [{ count: em }, { count: dl }, { count: iq }, { count: ct }] = await Promise.all([
      db.from("emails").select("id", { count: "exact", head: true }).eq("company_id", coid),
      db.from("deals").select("id", { count: "exact", head: true }).eq("company_id", coid),
      db.from("inquiries").select("id", { count: "exact", head: true }).eq("company_id", coid),
      db.from("contacts").select("id", { count: "exact", head: true }).eq("company_id", coid),
    ]);
    if ((em ?? 0) + (dl ?? 0) + (iq ?? 0) + (ct ?? 0) === 0) {
      const { data: c } = await db.from("companies").select("name, domain").eq("id", coid).maybeSingle();
      await db.from("companies").delete().eq("id", coid);
      console.log(`参照の無くなった取引先を削除: ${c?.name} (${c?.domain})`);
    }
  }
}
console.log(`\n${apply ? "更新" : "対象"}: ${changed || "(dry-run)"} 件`);
