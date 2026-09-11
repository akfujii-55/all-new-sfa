"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { extractFromEmail } from "@/lib/mail/extract";
import type { InquiryStatus } from "@/lib/types";

export async function updateInquiryStatus(id: string, status: InquiryStatus) {
  const supabase = await createClient();
  const { error } = await supabase.from("inquiries").update({ status }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/inquiries");
  revalidatePath("/");
}

export async function createInquiry(formData: FormData) {
  const supabase = await createClient();
  const subject = String(formData.get("subject") ?? "").trim();
  if (!subject) throw new Error("件名は必須です");
  const companyId = String(formData.get("company_id") ?? "") || null;
  const { error } = await supabase.from("inquiries").insert({
    company_id: companyId,
    contact_id: String(formData.get("contact_id") ?? "") || null,
    subject,
    summary: String(formData.get("summary") ?? "").trim() || null,
    category: String(formData.get("category") ?? "").trim() || null,
    status: "new",
  });
  if (error) throw new Error(error.message);
  revalidatePath("/inquiries");
  if (companyId) revalidatePath(`/companies/${companyId}`);
}

/**
 * 問い合わせを削除する。紐付いていたメールと案件は残り、メールは「問い合わせ未登録」に戻る
 * (emails.inquiry_id / deals.inquiry_id は外部キーの on delete set null で外れる)。
 */
export async function deleteInquiry(id: string) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("ログインが必要です");

  const { data: inq } = await supabase.from("inquiries").select("id, company_id, deal_id").eq("id", id).maybeSingle();
  if (!inq) throw new Error("問い合わせが見つかりません(すでに削除されている可能性があります)");

  const { error } = await supabase.from("inquiries").delete().eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/inquiries");
  revalidatePath("/inbox");
  revalidatePath("/");
  if (inq.company_id) revalidatePath(`/companies/${inq.company_id}`);
  if (inq.deal_id) revalidatePath(`/deals/${inq.deal_id}`);
}

export interface CreateInquiriesResult {
  created: number;
  skipped: number;
}

/**
 * メール画面で選択されたメール(スレッド)を問い合わせとして登録する。
 * - スレッド内の最新の受信メールを元に件名・要約・分類を作る
 * - すでに問い合わせが紐付いているスレッドはスキップ
 * - スレッド内の全メールに inquiry_id を付ける
 */
export async function createInquiriesFromEmails(emailIds: string[]): Promise<CreateInquiriesResult> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("ログインが必要です");

  const ids = Array.from(new Set(emailIds.filter(Boolean)));
  if (ids.length === 0) return { created: 0, skipped: 0 };

  const { data: seeds, error: seedErr } = await supabase.from("emails").select("id, thread_key").in("id", ids);
  if (seedErr) throw new Error(seedErr.message);
  const threadKeys = Array.from(new Set((seeds ?? []).map((e) => e.thread_key)));

  let created = 0;
  let skipped = 0;
  const companyIds = new Set<string>();

  for (const threadKey of threadKeys) {
    const { data: thread } = await supabase
      .from("emails")
      .select("id, direction, from_address, from_name, subject, text_body, received_at, company_id, contact_id, deal_id, inquiry_id")
      .eq("thread_key", threadKey)
      .order("received_at", { ascending: false });
    const emails = thread ?? [];
    if (emails.length === 0) { skipped++; continue; }
    if (emails.some((e) => e.inquiry_id)) { skipped++; continue; }

    const base = emails.find((e) => e.direction === "inbound") ?? emails[0];
    // 担当者・取引先は問い合わせ元の受信メール自身の紐付けを優先し、無ければスレッド内の他のメールから引き継ぐ
    const linked = emails.find((e) => e.company_id || e.contact_id || e.deal_id) ?? base;
    const contactId = base.contact_id ?? linked.contact_id;
    const companyId = base.company_id ?? linked.company_id;

    const extracted = await extractFromEmail({
      fromName: base.from_name,
      fromAddress: base.from_address,
      subject: base.subject,
      text: base.text_body ?? "",
    });

    const { data: inq, error } = await supabase
      .from("inquiries")
      .insert({
        company_id: companyId,
        contact_id: contactId,
        email_id: base.id,
        deal_id: linked.deal_id,
        subject: base.subject || "(件名なし)",
        summary: extracted.summary,
        category: extracted.category,
        status: linked.deal_id ? "converted" : "new",
        received_at: base.received_at,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    await supabase.from("emails").update({ inquiry_id: inq.id }).eq("thread_key", threadKey);
    if (companyId) companyIds.add(companyId);
    created++;
  }

  revalidatePath("/inbox");
  revalidatePath("/inquiries");
  revalidatePath("/");
  for (const id of companyIds) revalidatePath(`/companies/${id}`);
  return { created, skipped };
}
