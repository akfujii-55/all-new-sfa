"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertTenantWritable } from "@/lib/tenant-quota";
import { userError } from "@/lib/errors";
import { MAX_TAG_RULES, TAG_RULE_FIELDS, ruleMatches, splitKeywords, tagThreads, type TagRule, type TagRuleField } from "@/lib/tag-rules";

/** メールの自動タグ付けルール(設定画面のタグの下)。ログインユーザーのクライアントで動き、RLS で自テナントに絞られる */

async function requireUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw userError("ログインが必要です");
  await assertTenantWritable(supabase);
  return supabase;
}

function parseRule(formData: FormData): { field: TagRuleField; keywords: string; tag_id: string } {
  const field = String(formData.get("field") ?? "").trim() as TagRuleField;
  if (!TAG_RULE_FIELDS.some((f) => f.key === field)) throw userError("判定する場所(件名・差出人)を選んでください");
  const keywords = String(formData.get("keywords") ?? "").trim();
  if (!keywords) throw userError("キーワードを入力してください");
  if (keywords.length > 500) throw userError("キーワードは 500 文字以内にしてください");
  if (splitKeywords(keywords).length === 0) throw userError("キーワードを入力してください");
  const tag_id = String(formData.get("tag_id") ?? "").trim();
  if (!tag_id) throw userError("付けるタグを選んでください");
  return { field, keywords, tag_id };
}

export async function createTagRule(formData: FormData) {
  const supabase = await requireUser();
  const { count } = await supabase.from("email_tag_rules").select("id", { count: "exact", head: true });
  if ((count ?? 0) >= MAX_TAG_RULES) throw userError(`ルールは ${MAX_TAG_RULES} 個までです`);
  const rule = parseRule(formData);
  const { error } = await supabase.from("email_tag_rules").insert({ ...rule, sort_order: count ?? 0 });
  if (error) throw userError(error.message);
  revalidatePath("/settings");
}

export async function updateTagRule(id: string, formData: FormData) {
  const supabase = await requireUser();
  const rule = parseRule(formData);
  const { error } = await supabase.from("email_tag_rules").update(rule).eq("id", id);
  if (error) throw userError(error.message);
  revalidatePath("/settings");
}

/** ルールを削除する。すでに付いているタグはそのまま残る */
export async function deleteTagRule(id: string) {
  const supabase = await requireUser();
  const { error } = await supabase.from("email_tag_rules").delete().eq("id", id);
  if (error) throw userError(error.message);
  revalidatePath("/settings");
}

/** ルールを過去のメールにも適用する(一致したメールと同じスレッドにタグを付ける)。付けたメールの件数を返す */
export async function applyTagRuleToExisting(id: string): Promise<{ matched: number; tagged: number }> {
  const supabase = await requireUser();
  const { data: rule } = await supabase.from("email_tag_rules").select("id, field, keywords, tag_id").eq("id", id).maybeSingle();
  if (!rule) throw userError("ルールが見つかりません");
  const r = rule as TagRule;

  const threadKeys = new Set<string>();
  let matched = 0;
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await supabase
      .from("emails")
      .select("thread_key, subject, from_name, from_address")
      .order("received_at", { ascending: false })
      .range(from, from + page - 1);
    if (error) throw userError(error.message);
    for (const e of data ?? []) {
      if (ruleMatches(r, { subject: e.subject as string | null, fromName: e.from_name as string | null, fromAddress: e.from_address as string | null })) {
        matched++;
        threadKeys.add(e.thread_key as string);
      }
    }
    if (!data || data.length < page) break;
  }
  let tagged = 0;
  try {
    tagged = await tagThreads(supabase, Array.from(threadKeys), [r.tag_id]);
  } catch (e) {
    throw userError(`タグ付けに失敗しました: ${(e as Error).message}`);
  }
  revalidatePath("/inbox", "layout");
  return { matched, tagged };
}
