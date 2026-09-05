"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function s(v: FormDataEntryValue | null) {
  const t = String(v ?? "").trim();
  return t === "" ? null : t;
}

export async function createCompany(formData: FormData) {
  const supabase = await createClient();
  const name = s(formData.get("name"));
  if (!name) throw new Error("会社名は必須です");
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
  if (error) throw new Error(error.message);
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
  if (error) throw new Error(error.message);
  revalidatePath(`/companies/${id}`);
  revalidatePath("/companies");
}

export async function deleteCompany(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("companies").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/companies");
  redirect("/companies");
}

export async function createContact(formData: FormData) {
  const supabase = await createClient();
  const name = s(formData.get("name"));
  if (!name) throw new Error("氏名は必須です");
  const companyId = s(formData.get("company_id"));
  const { error } = await supabase.from("contacts").insert({
    company_id: companyId,
    name,
    email: s(formData.get("email"))?.toLowerCase() ?? null,
    phone: s(formData.get("phone")),
    title: s(formData.get("title")),
    memo: s(formData.get("memo")),
  });
  if (error) throw new Error(error.code === "23505" ? "このメールアドレスは既に登録されています" : error.message);
  revalidatePath("/contacts");
  if (companyId) revalidatePath(`/companies/${companyId}`);
}

export async function updateContact(id: string, formData: FormData) {
  const supabase = await createClient();
  const companyId = s(formData.get("company_id"));
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
  if (error) throw new Error(error.message);
  revalidatePath("/contacts");
  if (companyId) revalidatePath(`/companies/${companyId}`);
}

export async function deleteContact(id: string, companyId?: string | null) {
  const supabase = await createClient();
  const { error } = await supabase.from("contacts").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/contacts");
  if (companyId) revalidatePath(`/companies/${companyId}`);
}
