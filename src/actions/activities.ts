"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertTenantWritable } from "@/lib/tenant-quota";
import { fmtDue, parseLocalInput } from "@/lib/format";
import { notifyAssigned } from "@/lib/notifications";
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
  const ownerId = await ownerIdOf(supabase, formData.get("owner_id"));
  const dueAt = parseLocalInput(s(formData.get("due_at")));
  const done = formData.get("done") === "on";
  const { error } = await supabase.from("deal_activities").insert({
    deal_id: dealId,
    kind_id: await kindIdOf(supabase, formData.get("kind_id")),
    body,
    due_at: dueAt,
    done_at: done ? new Date().toISOString() : null,
    author_id: userId,
    owner_id: ownerId,
  });
  if (error) throw userError(error.message);
  if (!done) await notifyActivityOwner(supabase, { dealId, ownerId, previousOwnerId: null, body, dueAt, userId });
  revalidate(dealId);
}

/** 行動の担当者に付けられた人に知らせる(完了済みの行動では知らせない) */
async function notifyActivityOwner(
  supabase: SupabaseClient,
  a: { dealId: string; ownerId: string | null; previousOwnerId: string | null; body: string; dueAt: string | null; userId: string },
): Promise<void> {
  if (!a.ownerId || a.ownerId === a.previousOwnerId) return;
  const { data: deal } = await supabase.from("deals").select("title, company:companies(name)").eq("id", a.dealId).maybeSingle();
  const company = deal?.company as unknown as { name: string } | null;
  const parts = [deal?.title ? `案件: ${deal.title}` : null, company?.name ?? null, a.dueAt ? `期限: ${fmtDue(a.dueAt)}` : null].filter(Boolean);
  await notifyAssigned(supabase, {
    memberId: a.ownerId,
    previousMemberId: a.previousOwnerId,
    kind: "activity_assigned",
    title: a.body.length > 60 ? `${a.body.slice(0, 60)}…` : a.body,
    body: parts.join(" ・ ") || null,
    href: `/deals/${a.dealId}`,
    actorUserId: a.userId,
  });
}

export async function updateActivity(id: string, dealId: string, formData: FormData): Promise<void> {
  const { supabase, userId } = await requireUser();
  const body = s(formData.get("body"));
  if (!body) throw userError("内容を入力してください");
  const { data: before } = await supabase.from("deal_activities").select("owner_id, done_at").eq("id", id).maybeSingle();
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
  if (!before?.done_at) await notifyActivityOwner(supabase, { dealId, ownerId, previousOwnerId: (before?.owner_id as string | null) ?? null, body, dueAt, userId });
  revalidate(dealId);
}

/** 担当者だけの変更(ダッシュボード・行動一覧の行から) */
export async function setActivityOwner(id: string, dealId: string, ownerId: string | null): Promise<void> {
  const { supabase, userId } = await requireUser();
  const owner = ownerId ? await ownerIdOf(supabase, ownerId) : null;
  const { data: before } = await supabase.from("deal_activities").select("owner_id, body, due_at, done_at").eq("id", id).maybeSingle();
  const { error } = await supabase.from("deal_activities").update({ owner_id: owner }).eq("id", id);
  if (error) throw userError(error.message);
  if (before && !before.done_at) {
    await notifyActivityOwner(supabase, { dealId, ownerId: owner, previousOwnerId: (before.owner_id as string | null) ?? null, body: before.body as string, dueAt: (before.due_at as string | null) ?? null, userId });
  }
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
