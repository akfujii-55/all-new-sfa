"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertTenantWritable } from "@/lib/tenant-quota";
import { userError } from "@/lib/errors";
import { EMAIL_TEMPLATE_LIMITS, MAX_EMAIL_TEMPLATES } from "@/lib/mail/merge";

/** メールテンプレート(設定画面)。会社共通は 10 個まで、自分専用は営業担当者ごとに 10 個まで。ログインユーザーのクライアントで動き、RLS で自テナントに絞られる */

async function requireUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw userError("ログインが必要です");
  await assertTenantWritable(supabase);
  return { supabase, userId: data.user.id };
}

/** ログインユーザーに対応する営業担当者(members)の id。自分専用テンプレートの持ち主になる */
async function myMemberId(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data } = await supabase.from("members").select("id").eq("profile_id", userId).maybeSingle();
  return data?.id ?? null;
}

function parseTemplate(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw userError("テンプレートの名前を入力してください");
  if (name.length > EMAIL_TEMPLATE_LIMITS.name) throw userError(`名前は ${EMAIL_TEMPLATE_LIMITS.name} 文字以内にしてください`);
  const subject = String(formData.get("subject") ?? "").replace(/\r\n/g, "\n").trim();
  if (subject.length > EMAIL_TEMPLATE_LIMITS.subject) throw userError(`件名は ${EMAIL_TEMPLATE_LIMITS.subject} 文字以内にしてください`);
  const body = String(formData.get("body") ?? "").replace(/\r\n/g, "\n").replace(/\s+$/, "");
  if (!body.trim()) throw userError("本文を入力してください");
  if (body.length > EMAIL_TEMPLATE_LIMITS.body) throw userError(`本文は ${EMAIL_TEMPLATE_LIMITS.body} 文字以内にしてください`);
  const scope = String(formData.get("scope") ?? "all") === "mine" ? "mine" : "all";
  return { name, subject, body, scope } as const;
}

async function resolveOwner(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, scope: "all" | "mine") {
  if (scope === "all") return null;
  const memberId = await myMemberId(supabase, userId);
  if (!memberId) throw userError("自分専用にするには、営業担当者ページであなたのログインに対応する営業担当者が登録されている必要があります");
  return memberId;
}

async function assertUnderLimit(supabase: Awaited<ReturnType<typeof createClient>>, memberId: string | null, excludeId?: string) {
  let q = supabase.from("email_templates").select("id", { count: "exact", head: true });
  q = memberId ? q.eq("member_id", memberId) : q.is("member_id", null);
  if (excludeId) q = q.neq("id", excludeId);
  const { count } = await q;
  if ((count ?? 0) >= MAX_EMAIL_TEMPLATES) {
    throw userError(memberId ? `自分専用のテンプレートは ${MAX_EMAIL_TEMPLATES} 個までです` : `会社共通のテンプレートは ${MAX_EMAIL_TEMPLATES} 個までです`);
  }
  return count ?? 0;
}

export async function createEmailTemplate(formData: FormData) {
  const { supabase, userId } = await requireUser();
  const t = parseTemplate(formData);
  const memberId = await resolveOwner(supabase, userId, t.scope);
  const count = await assertUnderLimit(supabase, memberId);
  const { error } = await supabase.from("email_templates").insert({ name: t.name, subject: t.subject, body: t.body, member_id: memberId, sort_order: count });
  if (error) throw userError(error.message);
  revalidatePath("/", "layout");
}

export async function updateEmailTemplate(id: string, formData: FormData) {
  const { supabase, userId } = await requireUser();
  const t = parseTemplate(formData);
  const memberId = await resolveOwner(supabase, userId, t.scope);
  const { data: current } = await supabase.from("email_templates").select("member_id").eq("id", id).maybeSingle();
  if (!current) throw userError("テンプレートが見つかりません");
  // 公開範囲を変えるときは、移る先の上限を確認する
  if (current.member_id !== memberId) await assertUnderLimit(supabase, memberId);
  const { error } = await supabase.from("email_templates").update({ name: t.name, subject: t.subject, body: t.body, member_id: memberId }).eq("id", id);
  if (error) throw userError(error.message);
  revalidatePath("/", "layout");
}

export async function deleteEmailTemplate(id: string) {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("email_templates").delete().eq("id", id);
  if (error) throw userError(error.message);
  revalidatePath("/", "layout");
}

/**
 * 宛先のメールアドレスから登録済みの担当者を探す(受信トレイの「新規作成」で差し込み項目に使う)。
 * 見つからなければ null。
 */
export async function lookupContactByEmail(email: string): Promise<{ contactName: string; companyName: string | null } | null> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw userError("ログインが必要です");
  const addr = email.trim().toLowerCase();
  if (!addr.includes("@")) return null;
  const { data } = await supabase.from("contacts").select("name, company:companies(name)").eq("email", addr).maybeSingle();
  if (!data) return null;
  const company = data.company as unknown as { name: string } | { name: string }[] | null;
  const companyName = Array.isArray(company) ? company[0]?.name ?? null : company?.name ?? null;
  return { contactName: data.name, companyName };
}
