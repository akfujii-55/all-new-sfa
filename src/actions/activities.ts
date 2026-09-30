"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertTenantWritable } from "@/lib/tenant-quota";
import { fmtDue, parseLocalInput } from "@/lib/format";
import { notifyAssigned } from "@/lib/notifications";
import type { SupabaseClient } from "@supabase/supabase-js";

import { userError } from "@/lib/errors";
import { assertSalesEnabled } from "@/lib/features-server";
/**
 * 行動(電話・メール・訪問などの履歴と、期限付きの Todo)。案件か問い合わせのどちらかに付く(0039)。
 * 問い合わせの行動は利用タイプ「メール管理」でも使う。案件化すると案件の行動にもなる(createDeal)。
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

/** 行動の付け先(案件・問い合わせ)。どちらも無い行動は無い */
type Target = { dealId: string | null; inquiryId: string | null };

function revalidate(t: Target) {
  if (t.dealId) {
    revalidatePath(`/deals/${t.dealId}`);
    revalidatePath("/deals");
  }
  if (t.inquiryId) revalidatePath("/inquiries");
  revalidatePath("/activities");
  revalidatePath("/");
}

/** 行動の付け先を DB から読む(完了・削除・担当者の変更は画面から行の ID だけで呼べるようにする) */
async function targetOf(supabase: SupabaseClient, id: string): Promise<Target> {
  const { data } = await supabase.from("deal_activities").select("deal_id, inquiry_id").eq("id", id).maybeSingle();
  return { dealId: (data?.deal_id as string | null) ?? null, inquiryId: (data?.inquiry_id as string | null) ?? null };
}

async function insertActivity(target: Target, formData: FormData): Promise<void> {
  const { supabase, userId } = await requireUser();
  const body = s(formData.get("body"));
  if (!body) throw userError("内容を入力してください");
  const ownerId = await ownerIdOf(supabase, formData.get("owner_id"));
  const dueAt = parseLocalInput(s(formData.get("due_at")));
  const done = formData.get("done") === "on";
  const { error } = await supabase.from("deal_activities").insert({
    deal_id: target.dealId,
    inquiry_id: target.inquiryId,
    kind_id: await kindIdOf(supabase, formData.get("kind_id")),
    body,
    due_at: dueAt,
    done_at: done ? new Date().toISOString() : null,
    author_id: userId,
    owner_id: ownerId,
  });
  if (error) throw userError(error.message);
  if (!done) await notifyActivityOwner(supabase, { ...target, ownerId, previousOwnerId: null, body, dueAt, userId });
  revalidate(target);
}

/** 案件の行動を登録する */
export async function addActivity(dealId: string, formData: FormData): Promise<void> {
  await assertSalesEnabled();
  await insertActivity({ dealId, inquiryId: null }, formData);
}

/** 問い合わせの行動を登録する。案件化済みの問い合わせなら、その案件の行動にもする */
export async function addInquiryActivity(inquiryId: string, formData: FormData): Promise<void> {
  const supabase = await createClient();
  const { data: inq } = await supabase.from("inquiries").select("id, deal_id").eq("id", inquiryId).maybeSingle();
  if (!inq) throw userError("問い合わせが見つかりません(すでに削除されている可能性があります)");
  await insertActivity({ dealId: (inq.deal_id as string | null) ?? null, inquiryId }, formData);
}

/** 行動の担当者に付けられた人に知らせる(完了済みの行動では知らせない) */
async function notifyActivityOwner(
  supabase: SupabaseClient,
  a: Target & { ownerId: string | null; previousOwnerId: string | null; body: string; dueAt: string | null; userId: string },
): Promise<void> {
  if (!a.ownerId || a.ownerId === a.previousOwnerId) return;
  // 案件の行動は案件へ、問い合わせだけの行動は問い合わせ一覧のその問い合わせへ案内する
  let label: string | null = null;
  let companyName: string | null = null;
  let href = "/activities";
  if (a.dealId) {
    const { data: deal } = await supabase.from("deals").select("title, company:companies(name)").eq("id", a.dealId).maybeSingle();
    label = deal?.title ? `案件: ${deal.title}` : null;
    companyName = (deal?.company as unknown as { name: string } | null)?.name ?? null;
    href = `/deals/${a.dealId}`;
  } else if (a.inquiryId) {
    const { data: inq } = await supabase.from("inquiries").select("subject, company:companies(name)").eq("id", a.inquiryId).maybeSingle();
    label = inq?.subject ? `問い合わせ: ${inq.subject}` : null;
    companyName = (inq?.company as unknown as { name: string } | null)?.name ?? null;
    href = `/inquiries?status=all&focus=${a.inquiryId}#${a.inquiryId}`;
  }
  const parts = [label, companyName, a.dueAt ? `期限: ${fmtDue(a.dueAt)}` : null].filter(Boolean);
  await notifyAssigned(supabase, {
    memberId: a.ownerId,
    previousMemberId: a.previousOwnerId,
    kind: "activity_assigned",
    title: a.body.length > 60 ? `${a.body.slice(0, 60)}…` : a.body,
    body: parts.join(" ・ ") || null,
    href,
    actorUserId: a.userId,
  });
}

export async function updateActivity(id: string, formData: FormData): Promise<void> {
  const { supabase, userId } = await requireUser();
  const body = s(formData.get("body"));
  if (!body) throw userError("内容を入力してください");
  const { data: before } = await supabase.from("deal_activities").select("owner_id, done_at, deal_id, inquiry_id").eq("id", id).maybeSingle();
  if (!before) throw userError("行動が見つかりません(すでに削除されている可能性があります)");
  const target: Target = { dealId: (before.deal_id as string | null) ?? null, inquiryId: (before.inquiry_id as string | null) ?? null };
  const ownerId = await ownerIdOf(supabase, formData.get("owner_id"));
  const dueAt = parseLocalInput(s(formData.get("due_at")));
  const { error } = await supabase
    .from("deal_activities")
    .update({
      kind_id: await kindIdOf(supabase, formData.get("kind_id")),
      body,
      due_at: dueAt,
      owner_id: ownerId,
    })
    .eq("id", id);
  if (error) throw userError(error.message);
  if (!before.done_at) await notifyActivityOwner(supabase, { ...target, ownerId, previousOwnerId: (before.owner_id as string | null) ?? null, body, dueAt, userId });
  revalidate(target);
}

/** 担当者だけの変更(ダッシュボード・行動一覧の行から) */
export async function setActivityOwner(id: string, ownerId: string | null): Promise<void> {
  const { supabase, userId } = await requireUser();
  const owner = ownerId ? await ownerIdOf(supabase, ownerId) : null;
  const { data: before } = await supabase.from("deal_activities").select("owner_id, body, due_at, done_at, deal_id, inquiry_id").eq("id", id).maybeSingle();
  const { error } = await supabase.from("deal_activities").update({ owner_id: owner }).eq("id", id);
  if (error) throw userError(error.message);
  const target: Target = { dealId: (before?.deal_id as string | null) ?? null, inquiryId: (before?.inquiry_id as string | null) ?? null };
  if (before && !before.done_at) {
    await notifyActivityOwner(supabase, { ...target, ownerId: owner, previousOwnerId: (before.owner_id as string | null) ?? null, body: before.body as string, dueAt: (before.due_at as string | null) ?? null, userId });
  }
  revalidate(target);
}

/** 完了・未完了の切り替え */
export async function setActivityDone(id: string, done: boolean): Promise<void> {
  const { supabase } = await requireUser();
  const target = await targetOf(supabase, id);
  const { error } = await supabase.from("deal_activities").update({ done_at: done ? new Date().toISOString() : null }).eq("id", id);
  if (error) throw userError(error.message);
  revalidate(target);
}

export async function deleteActivity(id: string): Promise<void> {
  const { supabase } = await requireUser();
  const target = await targetOf(supabase, id);
  const { error } = await supabase.from("deal_activities").delete().eq("id", id);
  if (error) throw userError(error.message);
  revalidate(target);
}
