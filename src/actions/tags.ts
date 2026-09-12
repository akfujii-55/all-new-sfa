"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertTenantWritable } from "@/lib/tenant-quota";
import { MAX_TAGS, TAG_COLORS } from "@/lib/tags";

/**
 * タグ(tags)と、メール・担当者への付け外し。
 * すべてログインユーザーのクライアントで動き、RLS で自テナントに絞られる。tenant_id はトリガーが補う。
 */

async function requireUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("ログインが必要です");
  await assertTenantWritable(supabase);
  return supabase;
}

function s(v: FormDataEntryValue | null) {
  const t = String(v ?? "").trim();
  return t === "" ? null : t;
}

function revalidateTagPages() {
  revalidatePath("/settings");
  revalidatePath("/inbox", "layout");
  revalidatePath("/contacts");
}

// ---------- タグの管理(設定画面) ----------

export async function createTag(formData: FormData) {
  const supabase = await requireUser();
  const name = s(formData.get("name"));
  const color = s(formData.get("color")) ?? "gray";
  if (!name) throw new Error("タグ名を入力してください");
  if (name.length > 30) throw new Error("タグ名は 30 文字以内にしてください");
  if (!TAG_COLORS.some((c) => c.key === color)) throw new Error("色の指定が不正です");
  const { count } = await supabase.from("tags").select("id", { count: "exact", head: true });
  if ((count ?? 0) >= MAX_TAGS) throw new Error(`タグは ${MAX_TAGS} 個までです`);
  const { error } = await supabase.from("tags").insert({ name, color, sort_order: count ?? 0 });
  if (error) {
    if (error.code === "23505") throw new Error("同じ名前のタグがあります");
    throw new Error(error.message);
  }
  revalidateTagPages();
}

export async function updateTag(id: string, formData: FormData) {
  const supabase = await requireUser();
  const name = s(formData.get("name"));
  const color = s(formData.get("color")) ?? "gray";
  if (!name) throw new Error("タグ名を入力してください");
  if (name.length > 30) throw new Error("タグ名は 30 文字以内にしてください");
  if (!TAG_COLORS.some((c) => c.key === color)) throw new Error("色の指定が不正です");
  const { error } = await supabase.from("tags").update({ name, color }).eq("id", id);
  if (error) {
    if (error.code === "23505") throw new Error("同じ名前のタグがあります");
    throw new Error(error.message);
  }
  revalidateTagPages();
}

/** タグを削除する。付いていたメール・担当者からも外れる(cascade) */
export async function deleteTag(id: string) {
  const supabase = await requireUser();
  const { error } = await supabase.from("tags").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidateTagPages();
}

// ---------- 付け外し ----------

export interface TagChange {
  add: string[];
  remove: string[];
}

/**
 * 選択したメール(スレッドの代表)にタグを付け外しする。
 * スレッド内の全メールと、そのスレッドに紐付く担当者にも同じタグを付ける(担当者からは外さない)。
 */
export async function setEmailTags(emailIds: string[], change: TagChange): Promise<{ emails: number; contacts: number }> {
  const supabase = await requireUser();
  const ids = Array.from(new Set(emailIds.filter(Boolean)));
  if (ids.length === 0 || (change.add.length === 0 && change.remove.length === 0)) return { emails: 0, contacts: 0 };

  const { data: seeds } = await supabase.from("emails").select("thread_key").in("id", ids);
  const threadKeys = Array.from(new Set((seeds ?? []).map((e) => e.thread_key as string)));
  if (threadKeys.length === 0) return { emails: 0, contacts: 0 };
  const { data: members } = await supabase.from("emails").select("id, contact_id").in("thread_key", threadKeys);
  const emailAll = (members ?? []).map((m) => m.id as string);
  const contactAll = Array.from(new Set((members ?? []).map((m) => m.contact_id as string | null).filter((c): c is string => Boolean(c))));

  if (change.remove.length > 0) {
    const { error } = await supabase.from("email_tags").delete().in("email_id", emailAll).in("tag_id", change.remove);
    if (error) throw new Error(error.message);
  }
  if (change.add.length > 0) {
    const rows = emailAll.flatMap((email_id) => change.add.map((tag_id) => ({ email_id, tag_id })));
    const { error } = await supabase.from("email_tags").upsert(rows, { onConflict: "email_id,tag_id", ignoreDuplicates: true });
    if (error) throw new Error(error.message);
    if (contactAll.length > 0) {
      const crows = contactAll.flatMap((contact_id) => change.add.map((tag_id) => ({ contact_id, tag_id })));
      const { error: cErr } = await supabase.from("contact_tags").upsert(crows, { onConflict: "contact_id,tag_id", ignoreDuplicates: true });
      if (cErr) throw new Error(cErr.message);
    }
  }
  revalidatePath("/inbox", "layout");
  revalidatePath("/contacts");
  return { emails: emailAll.length, contacts: change.add.length > 0 ? contactAll.length : 0 };
}

/** 担当者にタグを付け外しする */
export async function setContactTags(contactIds: string[], change: TagChange): Promise<{ contacts: number }> {
  const supabase = await requireUser();
  const ids = Array.from(new Set(contactIds.filter(Boolean)));
  if (ids.length === 0 || (change.add.length === 0 && change.remove.length === 0)) return { contacts: 0 };
  if (change.remove.length > 0) {
    const { error } = await supabase.from("contact_tags").delete().in("contact_id", ids).in("tag_id", change.remove);
    if (error) throw new Error(error.message);
  }
  if (change.add.length > 0) {
    const rows = ids.flatMap((contact_id) => change.add.map((tag_id) => ({ contact_id, tag_id })));
    const { error } = await supabase.from("contact_tags").upsert(rows, { onConflict: "contact_id,tag_id", ignoreDuplicates: true });
    if (error) throw new Error(error.message);
  }
  revalidatePath("/contacts");
  revalidatePath("/inbox", "layout");
  return { contacts: ids.length };
}
