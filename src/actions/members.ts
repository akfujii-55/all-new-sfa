"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

function s(v: FormDataEntryValue | null) {
  const t = String(v ?? "").trim();
  return t === "" ? null : t;
}

function revalidate() {
  revalidatePath("/members");
  revalidatePath("/deals");
}

export async function createMember(formData: FormData) {
  const supabase = await createClient();
  const name = s(formData.get("name"));
  if (!name) throw new Error("氏名は必須です");
  const { count } = await supabase.from("members").select("id", { count: "exact", head: true });
  const { error } = await supabase.from("members").insert({
    name,
    email: s(formData.get("email"))?.toLowerCase() ?? null,
    memo: s(formData.get("memo")),
    is_active: true,
    sort_order: count ?? 0,
  });
  if (error) throw new Error(error.message);
  revalidate();
}

export async function updateMember(id: string, formData: FormData) {
  const supabase = await createClient();
  const name = s(formData.get("name"));
  if (!name) throw new Error("氏名は必須です");
  const { error } = await supabase
    .from("members")
    .update({
      name,
      email: s(formData.get("email"))?.toLowerCase() ?? null,
      memo: s(formData.get("memo")),
      is_active: formData.get("is_active") !== "false",
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidate();
}

/** 営業担当を削除。担当していた案件の担当は「未設定」になる(外部キー on delete set null)。 */
export async function deleteMember(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("members").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidate();
}

/** 案件の営業担当を変更 */
export async function setDealOwner(dealId: string, memberId: string | null) {
  const supabase = await createClient();
  const { error } = await supabase.from("deals").update({ owner_id: memberId }).eq("id", dealId);
  if (error) throw new Error(error.message);
  revalidatePath("/deals");
  revalidatePath(`/deals/${dealId}`);
}
