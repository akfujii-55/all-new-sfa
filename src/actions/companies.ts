"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { propagateContactCompany } from "@/lib/relink";

import { userError } from "@/lib/errors";
function s(v: FormDataEntryValue | null) {
  const t = String(v ?? "").trim();
  return t === "" ? null : t;
}

export async function createCompany(formData: FormData) {
  const supabase = await createClient();
  const name = s(formData.get("name"));
  if (!name) throw userError("会社名は必須です");
  const { data, error } = await supabase
    .from("companies")
    .insert({
      name,
      domain: s(formData.get("domain"))?.toLowerCase() ?? null,
      industry: s(formData.get("industry")),
      phone: s(formData.get("phone")),
      website: s(formData.get("website")),
      address: s(formData.get("address")),
      memo: s(formData.get("memo")),
    })
    .select("id")
    .single();
  if (error) throw userError(error.message);
  revalidatePath("/companies");
  redirect(`/companies/${data.id}`);
}

export async function updateCompany(id: string, formData: FormData) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("companies")
    .update({
      name: s(formData.get("name")) ?? "名称未設定",
      domain: s(formData.get("domain"))?.toLowerCase() ?? null,
      industry: s(formData.get("industry")),
      phone: s(formData.get("phone")),
      website: s(formData.get("website")),
      address: s(formData.get("address")),
      memo: s(formData.get("memo")),
    })
    .eq("id", id);
  if (error) throw userError(error.message);
  revalidatePath(`/companies/${id}`);
  revalidatePath("/companies");
}

/**
 * 取引先を削除する。案件(deals)は取引先に紐付いて消える(DB は on delete cascade)ので、案件のある取引先は削除させない。
 * 担当者・メール・問い合わせは残り、取引先だけが外れる(on delete set null)。
 */
async function deleteCompaniesById(ids: string[]) {
  const supabase = await createClient();
  if (ids.length === 0) return;
  const { data: deals } = await supabase.from("deals").select("company_id, company:companies(name)").in("company_id", ids);
  if (deals && deals.length > 0) {
    const names = Array.from(new Set(deals.map((d) => (d.company as unknown as { name: string } | null)?.name ?? "").filter(Boolean)));
    throw userError(`案件のある取引先は削除できません(${names.join("、")})。先に案件を削除するか、別の取引先に統合してください`);
  }
  const { error } = await supabase.from("companies").delete().in("id", ids);
  if (error) throw userError(error.message);
  revalidatePath("/companies");
  revalidatePath("/contacts");
}

/** 取引先を 1 件削除する。redirectTo を渡すと削除後にそのページへ移動する(詳細ページから消したとき用) */
export async function deleteCompany(id: string, redirectTo?: string) {
  await deleteCompaniesById([id]);
  if (redirectTo) redirect(redirectTo);
}

/** 一覧で選択した取引先をまとめて削除する */
export async function deleteCompanies(ids: string[]) {
  await deleteCompaniesById(ids);
}

/** 一覧で選択した担当者をまとめて削除する(メール・問い合わせ・案件からは担当者だけが外れる) */
export async function deleteContacts(ids: string[]) {
  const supabase = await createClient();
  if (ids.length === 0) return;
  const { error } = await supabase.from("contacts").delete().in("id", ids);
  if (error) throw userError(error.message);
  revalidatePath("/contacts");
  revalidatePath("/companies");
}

export async function createContact(formData: FormData) {
  const supabase = await createClient();
  const name = s(formData.get("name"));
  if (!name) throw userError("氏名は必須です");
  const companyId = s(formData.get("company_id"));
  const { error } = await supabase.from("contacts").insert({
    company_id: companyId,
    name,
    email: s(formData.get("email"))?.toLowerCase() ?? null,
    phone: s(formData.get("phone")),
    title: s(formData.get("title")),
    memo: s(formData.get("memo")),
  });
  if (error) throw userError(error.code === "23505" ? "このメールアドレスは既に登録されています" : error.message);
  revalidatePath("/contacts");
  if (companyId) revalidatePath(`/companies/${companyId}`);
}

export async function updateContact(id: string, formData: FormData) {
  const supabase = await createClient();
  const companyId = s(formData.get("company_id"));
  const { data: before } = await supabase.from("contacts").select("company_id").eq("id", id).maybeSingle();
  const { error } = await supabase
    .from("contacts")
    .update({
      company_id: companyId,
      name: s(formData.get("name")) ?? "名称未設定",
      email: s(formData.get("email"))?.toLowerCase() ?? null,
      phone: s(formData.get("phone")),
      title: s(formData.get("title")),
      memo: s(formData.get("memo")),
    })
    .eq("id", id);
  if (error) throw userError(error.message);
  // 所属が変わったら、この担当者のメール・問い合わせの取引先も合わせる(旧所属のものだけ。案件は動かさない)
  if (before && before.company_id !== companyId) {
    await propagateContactCompany(supabase, id, before.company_id, companyId);
    if (before.company_id) revalidatePath(`/companies/${before.company_id}`);
    revalidatePath("/inbox");
    revalidatePath("/inquiries");
  }
  revalidatePath("/contacts");
  if (companyId) revalidatePath(`/companies/${companyId}`);
}

export async function deleteContact(id: string, companyId?: string | null) {
  const supabase = await createClient();
  const { error } = await supabase.from("contacts").delete().eq("id", id);
  if (error) throw userError(error.message);
  revalidatePath("/contacts");
  if (companyId) revalidatePath(`/companies/${companyId}`);
}
