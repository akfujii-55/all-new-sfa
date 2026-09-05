"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { DealStage } from "@/lib/types";

function s(v: FormDataEntryValue | null) {
  const t = String(v ?? "").trim();
  return t === "" ? null : t;
}
function n(v: FormDataEntryValue | null) {
  const t = String(v ?? "").replace(/[,¥\s]/g, "");
  const num = Number(t);
  return Number.isFinite(num) ? num : 0;
}

export interface RevenueLine {
  year_month: string; // yyyy-MM-dd(月初)
  amount: number;
  memo?: string | null;
}

export async function createDeal(formData: FormData) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const companyId = s(formData.get("company_id"));
  const title = s(formData.get("title"));
  if (!companyId || !title) throw new Error("顧客と案件名は必須です");
  const inquiryId = s(formData.get("inquiry_id"));
  const stage = (s(formData.get("stage")) ?? "appointment") as DealStage;

  const { data, error } = await supabase
    .from("deals")
    .insert({
      company_id: companyId,
      contact_id: s(formData.get("contact_id")),
      inquiry_id: inquiryId,
      title,
      stage,
      amount: n(formData.get("amount")),
      probability: stage === "appointment" ? 30 : stage === "lead" ? 10 : 50,
      appointment_at: s(formData.get("appointment_at")) ? new Date(String(formData.get("appointment_at"))).toISOString() : null,
      expected_close_date: s(formData.get("expected_close_date")),
      owner_id: auth.user?.id ?? null,
      memo: s(formData.get("memo")),
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  if (inquiryId) {
    await supabase.from("inquiries").update({ status: "converted", deal_id: data.id }).eq("id", inquiryId);
    // 問い合わせ元メールのスレッドを案件に紐付け
    const { data: inq } = await supabase.from("inquiries").select("email_id").eq("id", inquiryId).maybeSingle();
    if (inq?.email_id) {
      const { data: em } = await supabase.from("emails").select("thread_key").eq("id", inq.email_id).maybeSingle();
      if (em?.thread_key) {
        await supabase.from("emails").update({ deal_id: data.id }).eq("thread_key", em.thread_key).is("deal_id", null);
      }
    }
  }
  const emailId = s(formData.get("email_id"));
  if (emailId) {
    const { data: em } = await supabase.from("emails").select("thread_key").eq("id", emailId).maybeSingle();
    if (em?.thread_key) {
      await supabase.from("emails").update({ deal_id: data.id }).eq("thread_key", em.thread_key).is("deal_id", null);
    }
  }

  revalidatePath("/deals");
  revalidatePath("/inquiries");
  revalidatePath(`/companies/${companyId}`);
  redirect(`/deals/${data.id}`);
}

export async function updateDeal(id: string, formData: FormData) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("deals")
    .update({
      title: s(formData.get("title")) ?? "名称未設定",
      contact_id: s(formData.get("contact_id")),
      amount: n(formData.get("amount")),
      probability: Math.min(100, Math.max(0, n(formData.get("probability")))),
      appointment_at: s(formData.get("appointment_at")) ? new Date(String(formData.get("appointment_at"))).toISOString() : null,
      expected_close_date: s(formData.get("expected_close_date")),
      memo: s(formData.get("memo")),
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(`/deals/${id}`);
  revalidatePath("/deals");
}

/** カンバンでのステージ変更。won にする場合は revenues が必須 */
export async function moveDealStage(
  id: string,
  stage: DealStage,
  opts: { revenues?: RevenueLine[]; lostReason?: string; sortOrder?: number } = {},
) {
  const supabase = await createClient();
  const { data: deal, error: e0 } = await supabase.from("deals").select("id, company_id, stage").eq("id", id).single();
  if (e0 || !deal) throw new Error("案件が見つかりません");

  if (stage === "won") {
    const lines = (opts.revenues ?? []).filter((l) => l.amount > 0 && l.year_month);
    if (lines.length === 0) throw new Error("成約にするには売上計上(金額と計上月)が必要です");
    const total = lines.reduce((a, l) => a + l.amount, 0);
    const { error: e1 } = await supabase.from("revenues").delete().eq("deal_id", id);
    if (e1) throw new Error(e1.message);
    const { error: e2 } = await supabase.from("revenues").insert(
      lines.map((l) => ({ deal_id: id, company_id: deal.company_id, year_month: l.year_month, amount: l.amount, memo: l.memo ?? null })),
    );
    if (e2) throw new Error(e2.message);
    const { error } = await supabase
      .from("deals")
      .update({ stage, won_at: new Date().toISOString(), probability: 100, amount: total, sort_order: opts.sortOrder ?? 0 })
      .eq("id", id);
    if (error) throw new Error(error.message);
  } else {
    const patch: Record<string, unknown> = { stage, sort_order: opts.sortOrder ?? 0 };
    if (stage === "lost") {
      patch.lost_reason = opts.lostReason ?? null;
      patch.probability = 0;
    } else if (deal.stage === "won" || deal.stage === "lost") {
      patch.won_at = null;
      patch.lost_reason = null;
      patch.probability = stage === "negotiation" ? 70 : stage === "proposal" ? 50 : 30;
    }
    if (deal.stage === "won") {
      await supabase.from("revenues").delete().eq("deal_id", id);
    }
    const { error } = await supabase.from("deals").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
  }
  revalidatePath("/deals");
  revalidatePath(`/deals/${id}`);
  revalidatePath("/revenue");
  revalidatePath("/");
}

export async function reorderDeals(items: { id: string; stage: DealStage; sort_order: number }[]) {
  const supabase = await createClient();
  await Promise.all(
    items.map((it) => supabase.from("deals").update({ sort_order: it.sort_order }).eq("id", it.id).eq("stage", it.stage)),
  );
  revalidatePath("/deals");
}

export async function deleteDeal(id: string) {
  const supabase = await createClient();
  const { data: deal } = await supabase.from("deals").select("company_id").eq("id", id).maybeSingle();
  const { error } = await supabase.from("deals").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/deals");
  if (deal?.company_id) revalidatePath(`/companies/${deal.company_id}`);
  redirect("/deals");
}

export async function addDealNote(dealId: string, formData: FormData) {
  const supabase = await createClient();
  const body = s(formData.get("body"));
  if (!body) return;
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase.from("deal_notes").insert({ deal_id: dealId, author_id: auth.user?.id ?? null, body });
  if (error) throw new Error(error.message);
  revalidatePath(`/deals/${dealId}`);
}

export async function deleteDealNote(noteId: string, dealId: string) {
  const supabase = await createClient();
  await supabase.from("deal_notes").delete().eq("id", noteId);
  revalidatePath(`/deals/${dealId}`);
}

/** 成約済み案件の売上明細を編集 */
export async function saveRevenues(dealId: string, lines: RevenueLine[]) {
  const supabase = await createClient();
  const { data: deal } = await supabase.from("deals").select("company_id").eq("id", dealId).single();
  if (!deal) throw new Error("案件が見つかりません");
  const valid = lines.filter((l) => l.amount > 0 && l.year_month);
  if (valid.length === 0) throw new Error("売上明細を1件以上入力してください");
  await supabase.from("revenues").delete().eq("deal_id", dealId);
  const { error } = await supabase.from("revenues").insert(
    valid.map((l) => ({ deal_id: dealId, company_id: deal.company_id, year_month: l.year_month, amount: l.amount, memo: l.memo ?? null })),
  );
  if (error) throw new Error(error.message);
  await supabase.from("deals").update({ amount: valid.reduce((a, l) => a + l.amount, 0) }).eq("id", dealId);
  revalidatePath(`/deals/${dealId}`);
  revalidatePath("/revenue");
  revalidatePath("/");
}
