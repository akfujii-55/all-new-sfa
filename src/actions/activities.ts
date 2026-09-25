"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertTenantWritable } from "@/lib/tenant-quota";
import { parseLocalInput } from "@/lib/format";
import type { SupabaseClient } from "@supabase/supabase-js";

import { userError } from "@/lib/errors";
/**
 * 案件の行動(電話・メール・訪問などの履歴と、期限付きの Todo)。
 * 期限超過の判定は表示側(due_at < now かつ done_at が null)で行う。
 */

function s(v: FormDataEntryValue | null) {
  const t = String(v ?? "").trim();
  return t === "" ? null : t;
}

/** 種類 ID。自テナントの activity_kinds にあるものだけ受け付ける(RLS で他テナントの ID は見えない) */
async function kindIdOf(supabase: SupabaseClient, v: FormDataEntryValue | null): Promise<string> {
  const id = s(v);
  if (!id) throw userError("行動の種類を選んでください");
  const { data } = await supabase.from("activity_kinds").select("id").eq("id", id).maybeSingle();
  if (!data) throw userError("行動の種類が見つかりません。設定画面で種類を確認してください");
  return data.id as string;
}

/** 担当者 ID。空なら null、入っていれば自テナントの members にあるものだけ受け付ける */
async function ownerIdOf(supabase: SupabaseClient, v: FormDataEntryValue | null): Promise<string | null> {
  const id = s(v);
  if (!id) return null;
  const { data } = await supabase.from("members").select("id").eq("id", id).maybeSingle();
  if (!data) throw userError("担当者が見つかりません。営業担当者の画面で確認してください");
  return data.id as string;
}

async function requireUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw userError("ログインが必要です");
  await assertTenantWritable(supabase);
  return { supabase, userId: data.user.id };
}

function revalidate(dealId: string) {
  revalidatePath(`/deals/${dealId}`);
  revalidatePath("/deals");
  revalidatePath("/activities");
  revalidatePath("/");
}

export async function addActivity(dealId: string, formData: FormData): Promise<void> {
  const { supabase, userId } = await requireUser();
  const body = s(formData.get("body"));
  if (!body) throw userError("内容を入力してください");
  const { error } = await supabase.from("deal_activities").insert({
    deal_id: dealId,
    kind_id: await kindIdOf(supabase, formData.get("kind_id")),
    body,
    due_at: parseLocalInput(s(formData.get("due_at"))),
    done_at: formData.get("done") === "on" ? new Date().toISOString() : null,
    author_id: userId,
    owner_id: await ownerIdOf(supabase, formData.get("owner_id")),
  });
  if (error) throw userError(error.message);
  revalidate(dealId);
}

export async function updateActivity(id: string, dealId: string, formData: FormData): Promise<void> {
  const { supabase } = await requireUser();
  const body = s(formData.get("body"));
  if (!body) throw userError("内容を入力してください");
  const { error } = await supabase
    .from("deal_activities")
    .update({
      kind_id: await kindIdOf(supabase, formData.get("kind_id")),
      body,
      due_at: parseLocalInput(s(formData.get("due_at"))),
      owner_id: await ownerIdOf(supabase, formData.get("owner_id")),
    })
    .eq("id", id);
  if (error) throw userError(error.message);
  revalidate(dealId);
}

/** 担当者だけの変更(ダッシュボード・行動一覧の行から) */
export async function setActivityOwner(id: string, dealId: string, ownerId: string | null): Promise<void> {
  const { supabase } = await requireUser();
  const owner = ownerId ? await ownerIdOf(supabase, ownerId) : null;
  const { error } = await supabase.from("deal_activities").update({ owner_id: owner }).eq("id", id);
  if (error) throw userError(error.message);
  revalidate(dealId);
}

/** 完了・未完了の切り替え */
export async function setActivityDone(id: string, dealId: string, done: boolean): Promise<void> {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("deal_activities").update({ done_at: done ? new Date().toISOString() : null }).eq("id", id);
  if (error) throw userError(error.message);
  revalidate(dealId);
}

export async function deleteActivity(id: string, dealId: string): Promise<void> {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("deal_activities").delete().eq("id", id);
  if (error) throw userError(error.message);
  revalidate(dealId);
}
