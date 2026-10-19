"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertTenantWritable } from "@/lib/tenant-quota";
import { findCompanyByName } from "@/lib/mail/link";
import { CAMPAIGN_LIMITS, MAX_MAILING_LISTS } from "@/lib/campaigns-shared";
import { userError } from "@/lib/errors";

/**
 * 配信リスト(0043)の管理。リストはテナントごと最大 MAX_MAILING_LISTS、担当者(contacts)を出し入れする。
 * 担当者一覧の選択からの「配信リストに追加」、リスト画面での追加・除外、CSV の読み込み(無い担当者は登録する)。
 */

async function requireUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw userError("ログインが必要です");
  await assertTenantWritable(supabase);
  return supabase;
}

function revalidate(listId?: string | null) {
  revalidatePath("/campaigns", "layout");
  revalidatePath("/contacts");
  if (listId) revalidatePath(`/campaigns/lists/${listId}`);
}

function s(v: FormDataEntryValue | null | undefined): string {
  return String(v ?? "").trim();
}

export async function createMailingList(formData: FormData): Promise<{ id: string }> {
  const supabase = await requireUser();
  const name = s(formData.get("name"));
  const description = s(formData.get("description")) || null;
  if (!name) throw userError("リスト名を入力してください");
  if (name.length > CAMPAIGN_LIMITS.listName) throw userError(`リスト名は ${CAMPAIGN_LIMITS.listName} 文字以内にしてください`);
  if (description && description.length > CAMPAIGN_LIMITS.listDescription) throw userError(`説明は ${CAMPAIGN_LIMITS.listDescription} 文字以内にしてください`);
  const { count } = await supabase.from("mailing_lists").select("id", { count: "exact", head: true });
  if ((count ?? 0) >= MAX_MAILING_LISTS) throw userError(`配信リストは ${MAX_MAILING_LISTS} 個までです`);
  const { data, error } = await supabase.from("mailing_lists").insert({ name, description }).select("id").single();
  if (error) throw userError(error.code === "23505" ? "同じ名前の配信リストがあります" : "配信リストを作成できませんでした");
  revalidate();
  return { id: data.id as string };
}

export async function updateMailingList(id: string, formData: FormData): Promise<void> {
  const supabase = await requireUser();
  const name = s(formData.get("name"));
  const description = s(formData.get("description")) || null;
  if (!name) throw userError("リスト名を入力してください");
  if (name.length > CAMPAIGN_LIMITS.listName) throw userError(`リスト名は ${CAMPAIGN_LIMITS.listName} 文字以内にしてください`);
  if (description && description.length > CAMPAIGN_LIMITS.listDescription) throw userError(`説明は ${CAMPAIGN_LIMITS.listDescription} 文字以内にしてください`);
  const { error } = await supabase.from("mailing_lists").update({ name, description }).eq("id", id);
  if (error) throw userError(error.code === "23505" ? "同じ名前の配信リストがあります" : "配信リストを更新できませんでした");
  revalidate(id);
}

/** リストを削除する。過去の配信の記録は残る(list_id が外れ、list_name に名前が残る) */
export async function deleteMailingList(id: string): Promise<void> {
  const supabase = await requireUser();
  const { count } = await supabase.from("mail_campaigns").select("id", { count: "exact", head: true }).eq("list_id", id).in("status", ["scheduled", "sending", "paused"]);
  if ((count ?? 0) > 0) throw userError("予約中・送信中の配信があるため削除できません。配信を取り消してから削除してください");
  const { error } = await supabase.from("mailing_lists").delete().eq("id", id);
  if (error) throw userError("配信リストを削除できませんでした");
  revalidate();
}

/** 担当者をリストに追加する(既に入っている人は数えない)。戻り値は新しく追加した人数 */
export async function addContactsToMailingList(listId: string, contactIds: string[]): Promise<{ added: number; skipped: number }> {
  const supabase = await requireUser();
  const ids = Array.from(new Set(contactIds.filter(Boolean)));
  if (ids.length === 0) throw userError("追加する担当者を選んでください");
  const { data: list } = await supabase.from("mailing_lists").select("id").eq("id", listId).maybeSingle();
  if (!list) throw userError("配信リストが見つかりません");
  const { data: existing } = await supabase.from("mailing_list_contacts").select("contact_id").eq("list_id", listId).in("contact_id", ids);
  const have = new Set((existing ?? []).map((r) => r.contact_id as string));
  const rows = ids.filter((id) => !have.has(id)).map((contact_id) => ({ list_id: listId, contact_id }));
  if (rows.length > 0) {
    const { error } = await supabase.from("mailing_list_contacts").insert(rows);
    if (error) throw userError("配信リストに追加できませんでした");
  }
  revalidate(listId);
  return { added: rows.length, skipped: ids.length - rows.length };
}

export async function removeContactsFromMailingList(listId: string, contactIds: string[]): Promise<void> {
  const supabase = await requireUser();
  if (contactIds.length === 0) return;
  const { error } = await supabase.from("mailing_list_contacts").delete().eq("list_id", listId).in("contact_id", contactIds);
  if (error) throw userError("配信リストから外せませんでした");
  revalidate(listId);
}

export interface CsvImportResult {
  added: number;
  created: number;
  alreadyIn: number;
  invalid: number;
  /** 読み取れなかった行(先頭 10 件まで) */
  errors: string[];
}

const MAX_CSV_ROWS = 2000;

/** CSV の 1 行を列に分ける(ダブルクォート対応) */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === "," || ch === "\t") {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((v) => v.trim());
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * CSV(氏名, メールアドレス, 会社名 の順。1 行目が見出しなら読み飛ばす。タブ区切りも可)を読み込み、
 * メールアドレスで既存の担当者を探して追加する。無ければ担当者を登録する(会社名があれば既存の取引先に表記ゆれを吸収して照合し、無ければ取引先も作る)。
 */
export async function importCsvToMailingList(listId: string, csv: string): Promise<CsvImportResult> {
  const supabase = await requireUser();
  const { data: list } = await supabase.from("mailing_lists").select("id").eq("id", listId).maybeSingle();
  if (!list) throw userError("配信リストが見つかりません");
  const lines = csv.replace(/^﻿/, "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) throw userError("CSV の内容を貼り付けるか、ファイルを選んでください");
  if (lines.length > MAX_CSV_ROWS) throw userError(`一度に読み込めるのは ${MAX_CSV_ROWS} 行までです`);

  const result: CsvImportResult = { added: 0, created: 0, alreadyIn: 0, invalid: 0, errors: [] };
  const rows: { name: string; email: string; company: string }[] = [];
  for (const [i, line] of lines.entries()) {
    const cols = splitCsvLine(line);
    // 列の並びは 氏名, メール, 会社。メールだけの行(1 列)も受ける。見出し行はメール欄にアドレスが無いので invalid 扱いにせず読み飛ばす
    let name = cols[0] ?? "";
    let email = cols[1] ?? "";
    const company = cols[2] ?? "";
    if (cols.length === 1 && EMAIL_RE.test(cols[0])) {
      email = cols[0];
      name = "";
    } else if (EMAIL_RE.test(name) && !EMAIL_RE.test(email)) {
      // メール, 氏名 の順で書かれていた
      [name, email] = [email, name];
    }
    email = email.toLowerCase();
    if (!EMAIL_RE.test(email)) {
      if (i === 0) continue; // 見出し行
      result.invalid++;
      if (result.errors.length < 10) result.errors.push(`${i + 1} 行目: メールアドレスがありません(${line.slice(0, 40)})`);
      continue;
    }
    rows.push({ name: name || email.split("@")[0], email, company });
  }
  if (rows.length === 0) return result;

  // 既存の担当者をメールで引く
  const emails = Array.from(new Set(rows.map((r) => r.email)));
  const byEmail = new Map<string, string>();
  for (let i = 0; i < emails.length; i += 200) {
    const { data } = await supabase.from("contacts").select("id, email").in("email", emails.slice(i, i + 200));
    for (const c of data ?? []) if (c.email) byEmail.set((c.email as string).toLowerCase(), c.id as string);
  }
  // 無い担当者を登録する(会社名は既存の取引先に照合、無ければ作る)
  const companyCache = new Map<string, string | null>();
  for (const r of rows) {
    if (byEmail.has(r.email)) continue;
    let companyId: string | null = null;
    if (r.company) {
      if (companyCache.has(r.company)) companyId = companyCache.get(r.company) ?? null;
      else {
        companyId = await findCompanyByName(supabase, r.company);
        if (!companyId) {
          const { data: created } = await supabase.from("companies").insert({ name: r.company }).select("id").single();
          companyId = (created?.id as string | undefined) ?? null;
        }
        companyCache.set(r.company, companyId);
      }
    }
    const { data: created, error } = await supabase.from("contacts").insert({ name: r.name, email: r.email, company_id: companyId }).select("id").single();
    if (error || !created) {
      result.invalid++;
      if (result.errors.length < 10) result.errors.push(`${r.email}: 担当者を登録できませんでした`);
      continue;
    }
    byEmail.set(r.email, created.id as string);
    result.created++;
  }

  const ids = Array.from(new Set(rows.map((r) => byEmail.get(r.email)).filter(Boolean))) as string[];
  const { added, skipped } = await addContactsToMailingList(listId, ids);
  result.added = added;
  result.alreadyIn = skipped;
  revalidate(listId);
  return result;
}
