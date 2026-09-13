"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertTenantWritable } from "@/lib/tenant-quota";
import { parseLocalInput } from "@/lib/format";
import { ACTIVITY_KINDS, type ActivityKind } from "@/lib/types";

/**
 * 案件の行動(電話・メール・訪問などの履歴と、期限付きの Todo)。
 * 期限超過の判定は表示側(due_at < now かつ done_at が null)で行う。
 */

function s(v: FormDataEntryValue | null) {
  const t = String(v ?? "").trim();
  return t === "" ? null : t;
}

function kindOf(v: FormDataEntryValue | null): ActivityKind {
  const k = String(v ?? "");
  return (ACTIVITY_KINDS.some((x) => x.key === k) ? k : "other") as ActivityKind;
}

async function requireUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("ログインが必要です");
  await assertTenantWritable(supabase);
  return { supabase, userId: data.user.id };
}

function revalidate(dealId: string) {
  revalidatePath(`/deals/${dealId}`);
  revalidatePath("/deals");
  revalidatePath("/");
}

export async function addActivity(dealId: string, formData: FormData): Promise<void> {
  const { supabase, userId } = await requireUser();
  const body = s(formData.get("body"));
  if (!body) throw new Error("内容を入力してください");
  const { error } = await supabase.from("deal_activities").insert({
    deal_id: dealId,
    kind: kindOf(formData.get("kind")),
    body,
    due_at: parseLocalInput(s(formData.get("due_at"))),
    done_at: formData.get("done") === "on" ? new Date().toISOString() : null,
    author_id: userId,
  });
  if (error) throw new Error(error.message);
  revalidate(dealId);
}

export async function updateActivity(id: string, dealId: string, formData: FormData): Promise<void> {
  const { supabase } = await requireUser();
  const body = s(formData.get("body"));
  if (!body) throw new Error("内容を入力してください");
  const { error } = await supabase
    .from("deal_activities")
    .update({ kind: kindOf(formData.get("kind")), body, due_at: parseLocalInput(s(formData.get("due_at"))) })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidate(dealId);
}

/** 完了・未完了の切り替え */
export async function setActivityDone(id: string, dealId: string, done: boolean): Promise<void> {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("deal_activities").update({ done_at: done ? new Date().toISOString() : null }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidate(dealId);
}

export async function deleteActivity(id: string, dealId: string): Promise<void> {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("deal_activities").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidate(dealId);
}
