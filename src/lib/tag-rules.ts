import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * メールの自動タグ付けルール(email_tag_rules)。
 * 同期で取り込んだメールの件名・差出人がキーワードを含めば、そのメールと同じスレッドのメールにタグを付ける(担当者には付けない)。
 * 判定は全角半角・大文字小文字・空白の有無を区別しない(NFKC 正規化 + 小文字化 + 空白除去)。
 */

export const MAX_TAG_RULES = 20;
export const TAG_RULE_FIELDS = [
  { key: "subject", label: "件名" },
  { key: "from", label: "差出人" },
] as const;
export type TagRuleField = (typeof TAG_RULE_FIELDS)[number]["key"];

/** このタグが付いたメールは「問い合わせに登録」の対象から外す */
export const DELETE_LIST_TAG_NAME = "削除リスト";

export interface TagRule {
  id: string;
  field: TagRuleField;
  keywords: string;
  tag_id: string;
}

/** 全角半角・大文字小文字・空白の有無を無視して比べるための正規化(「お知らせ (自動メール)」と「お知らせ(自動メール)」を同じにする) */
export function normalizeText(s: string | null | undefined): string {
  return (s ?? "").normalize("NFKC").toLowerCase().replace(/\s+/g, "");
}

/** 「、」「,」「;」改行で区切ったキーワード(正規化済み、空は除く) */
export function splitKeywords(keywords: string): string[] {
  return Array.from(new Set(keywords.split(/[、,;\n]+/).map((k) => normalizeText(k)).filter(Boolean)));
}

export interface MatchTarget {
  subject: string | null | undefined;
  fromName: string | null | undefined;
  fromAddress: string | null | undefined;
}

export function ruleMatches(rule: Pick<TagRule, "field" | "keywords">, target: MatchTarget): boolean {
  const hay = rule.field === "subject" ? normalizeText(target.subject) : normalizeText(`${target.fromName ?? ""} <${target.fromAddress ?? ""}>`);
  if (!hay) return false;
  return splitKeywords(rule.keywords).some((k) => hay.includes(k));
}

/** 一致したルールのタグ ID(重複なし) */
export function matchTagRules(rules: TagRule[], target: MatchTarget): string[] {
  const out = new Set<string>();
  for (const r of rules) if (ruleMatches(r, target)) out.add(r.tag_id);
  return Array.from(out);
}

export async function loadTagRules(db: SupabaseClient): Promise<TagRule[]> {
  const { data } = await db.from("email_tag_rules").select("id, field, keywords, tag_id").order("sort_order").order("created_at");
  return (data ?? []) as TagRule[];
}

/** スレッド内の全メールにタグを付ける(付いているものは変えない)。担当者には付けない */
export async function tagThreads(db: SupabaseClient, threadKeys: string[], tagIds: string[]): Promise<number> {
  const keys = Array.from(new Set(threadKeys.filter(Boolean)));
  if (keys.length === 0 || tagIds.length === 0) return 0;
  let tagged = 0;
  for (let i = 0; i < keys.length; i += 200) {
    const { data: members, error } = await db.from("emails").select("id").in("thread_key", keys.slice(i, i + 200));
    if (error) throw error;
    const ids = (members ?? []).map((m) => m.id as string);
    if (ids.length === 0) continue;
    const rows = ids.flatMap((email_id) => tagIds.map((tag_id) => ({ email_id, tag_id })));
    const { error: upErr } = await db.from("email_tags").upsert(rows, { onConflict: "email_id,tag_id", ignoreDuplicates: true });
    if (upErr) throw upErr;
    tagged += ids.length;
  }
  return tagged;
}
