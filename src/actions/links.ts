"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertTenantWritable } from "@/lib/tenant-quota";

/**
 * 自動登録の誤りを直すための操作。
 * - relinkThread: メールスレッドの担当者・取引先を付け替える(スレッド内の全メールと、そのメールから作った問い合わせに反映)
 * - mergeContacts / mergeCompanies: 重複して作られた担当者・取引先を 1 つにまとめる(紐付くデータを移してから統合元を削除)
 * どれも RLS を通るログインユーザーのクライアントで行うので、自テナントの範囲でしか動かない。
 */

function s(v: unknown) {
  const t = String(v ?? "").trim();
  return t === "" ? null : t;
}

async function requireUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("ログインが必要です");
  await assertTenantWritable(supabase);
  return supabase;
}

function fail(error: { message: string; code?: string } | null) {
  if (error) throw new Error(error.message);
}

export type RelinkTarget =
  | { kind: "contact"; contactId: string }
  | { kind: "company"; companyId: string }
  | { kind: "new"; name: string; email: string | null; companyId: string | null; newCompanyName: string | null }
  | { kind: "none" };

/** スレッドの担当者・取引先を付け替える。emailId はスレッド内のどのメールでもよい */
export async function relinkThread(emailId: string, target: RelinkTarget): Promise<{ contactId: string | null; companyId: string | null }> {
  const db = await requireUser();
  const { data: root } = await db.from("emails").select("thread_key").eq("id", emailId).maybeSingle();
  if (!root) throw new Error("メールが見つかりません");

  let contactId: string | null = null;
  let companyId: string | null = null;

  if (target.kind === "contact") {
    const { data: c } = await db.from("contacts").select("id, company_id").eq("id", target.contactId).maybeSingle();
    if (!c) throw new Error("担当者が見つかりません");
    contactId = c.id;
    companyId = c.company_id;
  } else if (target.kind === "company") {
    const { data: c } = await db.from("companies").select("id").eq("id", target.companyId).maybeSingle();
    if (!c) throw new Error("取引先が見つかりません");
    companyId = c.id;
  } else if (target.kind === "new") {
    const name = s(target.name);
    if (!name) throw new Error("担当者の氏名を入力してください");
    const email = s(target.email)?.toLowerCase() ?? null;
    if (email && !email.includes("@")) throw new Error("メールアドレスの形式が正しくありません");
    companyId = s(target.companyId);
    const newCompanyName = s(target.newCompanyName);
    if (!companyId && newCompanyName) {
      const { data: created, error } = await db.from("companies").insert({ name: newCompanyName }).select("id").single();
      fail(error);
      companyId = created!.id;
    }
    if (email) {
      const { data: dup } = await db.from("contacts").select("id").eq("email", email).maybeSingle();
      if (dup) throw new Error("このメールアドレスの担当者は既に登録されています。一覧から選んでください");
    }
    const { data: created, error } = await db.from("contacts").insert({ name, email, company_id: companyId }).select("id").single();
    fail(error);
    contactId = created!.id;
  }

  const { data: rows } = await db.from("emails").select("id, deal_id").eq("thread_key", root.thread_key);
  const ids = (rows ?? []).map((r) => r.id);
  // 取引先が変わるなら、別の取引先の案件への紐付けは外す(案件は取引先に属する)
  const dealIds = Array.from(new Set((rows ?? []).map((r) => r.deal_id).filter(Boolean))) as string[];
  let keepDealIds = new Set<string>();
  if (dealIds.length && companyId) {
    const { data: deals } = await db.from("deals").select("id").in("id", dealIds).eq("company_id", companyId);
    keepDealIds = new Set((deals ?? []).map((d) => d.id));
  }
  for (const r of rows ?? []) {
    const dealId = r.deal_id && keepDealIds.has(r.deal_id) ? r.deal_id : null;
    const { error } = await db.from("emails").update({ contact_id: contactId, company_id: companyId, deal_id: dealId }).eq("id", r.id);
    fail(error);
  }
  if (ids.length) {
    const { error } = await db.from("inquiries").update({ contact_id: contactId, company_id: companyId }).in("email_id", ids);
    fail(error);
  }
  revalidatePath("/inbox");
  revalidatePath("/inquiries");
  revalidatePath("/contacts");
  revalidatePath("/companies");
  return { contactId, companyId };
}

/** 担当者を統合する。source の紐付きデータを target に移し、target の空欄を source で埋めて source を削除する */
export async function mergeContacts(sourceId: string, targetId: string): Promise<void> {
  if (sourceId === targetId) throw new Error("同じ担当者は統合できません");
  const db = await requireUser();
  const [{ data: source }, { data: target }] = await Promise.all([
    db.from("contacts").select("*").eq("id", sourceId).maybeSingle(),
    db.from("contacts").select("*").eq("id", targetId).maybeSingle(),
  ]);
  if (!source || !target) throw new Error("担当者が見つかりません");

  for (const table of ["emails", "inquiries", "deals"] as const) {
    const { error } = await db.from(table).update({ contact_id: targetId }).eq("contact_id", sourceId);
    fail(error);
  }
  // 取引先が付いていないメール・問い合わせには統合先の取引先を付ける
  if (target.company_id) {
    for (const table of ["emails", "inquiries"] as const) {
      const { error } = await db.from(table).update({ company_id: target.company_id }).eq("contact_id", targetId).is("company_id", null);
      fail(error);
    }
  }
  const { data: tags } = await db.from("contact_tags").select("tag_id").eq("contact_id", sourceId);
  for (const t of tags ?? []) {
    await db.from("contact_tags").upsert({ contact_id: targetId, tag_id: t.tag_id }, { onConflict: "contact_id,tag_id", ignoreDuplicates: true });
  }

  const { error: delErr } = await db.from("contacts").delete().eq("id", sourceId);
  fail(delErr);

  const patch: Record<string, unknown> = {};
  if (!target.email && source.email) patch.email = source.email;
  if (!target.phone && source.phone) patch.phone = source.phone;
  if (!target.title && source.title) patch.title = source.title;
  if (!target.company_id && source.company_id) patch.company_id = source.company_id;
  if (source.memo) patch.memo = target.memo ? `${target.memo}\n${source.memo}` : source.memo;
  if (Object.keys(patch).length) {
    const { error } = await db.from("contacts").update(patch).eq("id", targetId);
    fail(error);
  }
  revalidatePath("/contacts");
  revalidatePath("/companies");
  revalidatePath("/inbox");
  revalidatePath("/inquiries");
}

/** 取引先を統合する。担当者・メール・問い合わせ・案件・売上を target に移し、target の空欄を source で埋めて source を削除する */
export async function mergeCompanies(sourceId: string, targetId: string): Promise<void> {
  if (sourceId === targetId) throw new Error("同じ取引先は統合できません");
  const db = await requireUser();
  const [{ data: source }, { data: target }] = await Promise.all([
    db.from("companies").select("*").eq("id", sourceId).maybeSingle(),
    db.from("companies").select("*").eq("id", targetId).maybeSingle(),
  ]);
  if (!source || !target) throw new Error("取引先が見つかりません");

  for (const table of ["contacts", "emails", "inquiries", "deals", "revenues"] as const) {
    const { error } = await db.from(table).update({ company_id: targetId }).eq("company_id", sourceId);
    fail(error);
  }
  // ドメインは一意なので、先に統合元を消してから引き継ぐ
  const { error: delErr } = await db.from("companies").delete().eq("id", sourceId);
  fail(delErr);

  const patch: Record<string, unknown> = {};
  for (const k of ["domain", "industry", "phone", "website", "address"] as const) {
    if (!target[k] && source[k]) patch[k] = source[k];
  }
  if (source.memo) patch.memo = target.memo ? `${target.memo}\n${source.memo}` : source.memo;
  if (Object.keys(patch).length) {
    const { error } = await db.from("companies").update(patch).eq("id", targetId);
    fail(error);
  }
  revalidatePath("/companies");
  revalidatePath(`/companies/${targetId}`);
  revalidatePath("/contacts");
  revalidatePath("/inbox");
  revalidatePath("/inquiries");
  revalidatePath("/deals");
}
