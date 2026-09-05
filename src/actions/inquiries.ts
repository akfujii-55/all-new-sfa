"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
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

export async function deleteInquiry(id: string) {
  const supabase = await createClient();
  await supabase.from("inquiries").delete().eq("id", id);
  revalidatePath("/inquiries");
}
