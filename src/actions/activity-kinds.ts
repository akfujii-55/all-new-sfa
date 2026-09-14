"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertTenantWritable } from "@/lib/tenant-quota";
import { ACTIVITY_ICONS, MAX_ACTIVITY_KINDS } from "@/lib/activity-kinds";

import { userError } from "@/lib/errors";
/**
 * 行動の種類(activity_kinds)の管理。設定画面から追加・編集・削除・並び替えする。
 * ログインユーザーのクライアントで動き、RLS で自テナントに絞られる。tenant_id はトリガーが補う。
 */

async function requireUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw userError("ログインが必要です");
  await assertTenantWritable(supabase);
  return supabase;
}

function s(v: FormDataEntryValue | null) {
  const t = String(v ?? "").trim();
  return t === "" ? null : t;
}

function parse(formData: FormData) {
  const name = s(formData.get("name"));
  const icon = s(formData.get("icon")) ?? "other";
  if (!name) throw userError("種類の名前を入力してください");
  if (name.length > 30) throw userError("種類の名前は 30 文字以内にしてください");
  if (!ACTIVITY_ICONS.some((i) => i.key === icon)) throw userError("アイコンの指定が不正です");
  return { name, icon };
}

function revalidateKindPages() {
  revalidatePath("/settings");
  revalidatePath("/deals", "layout");
  revalidatePath("/activities");
  revalidatePath("/");
}

export async function createActivityKind(formData: FormData) {
  const supabase = await requireUser();
  const { name, icon } = parse(formData);
  const { count } = await supabase.from("activity_kinds").select("id", { count: "exact", head: true });
  if ((count ?? 0) >= MAX_ACTIVITY_KINDS) throw userError(`行動の種類は ${MAX_ACTIVITY_KINDS} 個までです`);
  const { error } = await supabase.from("activity_kinds").insert({ name, icon, sort_order: count ?? 0 });
  if (error) {
    if (error.code === "23505") throw userError("同じ名前の種類があります");
    throw userError(error.message);
  }
  revalidateKindPages();
}

export async function updateActivityKind(id: string, formData: FormData) {
  const supabase = await requireUser();
  const { name, icon } = parse(formData);
  const { error } = await supabase.from("activity_kinds").update({ name, icon }).eq("id", id);
  if (error) {
    if (error.code === "23505") throw userError("同じ名前の種類があります");
    throw userError(error.message);
  }
  revalidateKindPages();
}

/** 種類を削除する。使われている種類と最後の 1 個は削除できない */
export async function deleteActivityKind(id: string) {
  const supabase = await requireUser();
  const [{ count: used }, { count: total }] = await Promise.all([
    supabase.from("deal_activities").select("id", { count: "exact", head: true }).eq("kind_id", id),
    supabase.from("activity_kinds").select("id", { count: "exact", head: true }),
  ]);
  if ((used ?? 0) > 0) throw userError(`この種類を使っている行動が ${used} 件あるため削除できません。名前を変えて使うか、行動の種類を変更してください`);
  if ((total ?? 0) <= 1) throw userError("行動の種類は最低 1 個必要です");
  const { error } = await supabase.from("activity_kinds").delete().eq("id", id);
  if (error) {
    if (error.code === "23503") throw userError("この種類を使っている行動があるため削除できません");
    throw userError(error.message);
  }
  revalidateKindPages();
}

/** 並び順を保存する(id の配列の順に sort_order を振り直す) */
export async function reorderActivityKinds(ids: string[]) {
  const supabase = await requireUser();
  const unique = Array.from(new Set(ids.filter(Boolean)));
  await Promise.all(
    unique.map(async (id, i) => {
      const { error } = await supabase.from("activity_kinds").update({ sort_order: i }).eq("id", id);
      if (error) throw userError(error.message);
    }),
  );
  revalidateKindPages();
}
