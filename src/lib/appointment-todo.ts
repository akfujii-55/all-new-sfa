import type { SupabaseClient } from "@supabase/supabase-js";
import { MAX_ACTIVITY_KINDS } from "@/lib/activity-kinds";

/**
 * 案件のアポイント日時から、行動(Todo)「アポイント」を自動で作る・期限を合わせる。
 * 業務フロー: アポが確定したら案件を作る → その日時がそのまま次にやること(Todo)になる。
 * 種類「アポイント」が無ければ作る(上限に達していれば何もしない)。失敗しても案件の登録は止めない。
 */

export const APPOINTMENT_KIND_NAME = "アポイント";

async function appointmentKindId(db: SupabaseClient): Promise<string | null> {
  const { data } = await db.from("activity_kinds").select("id").eq("name", APPOINTMENT_KIND_NAME).maybeSingle();
  if (data) return data.id as string;
  const { count } = await db.from("activity_kinds").select("id", { count: "exact", head: true });
  if ((count ?? 0) >= MAX_ACTIVITY_KINDS) return null;
  const { data: created } = await db
    .from("activity_kinds")
    .insert({ name: APPOINTMENT_KIND_NAME, icon: "calendar", sort_order: count ?? 0 })
    .select("id")
    .maybeSingle();
  return (created?.id as string | undefined) ?? null;
}

export async function syncAppointmentTodo(
  db: SupabaseClient,
  input: {
    dealId: string;
    /** 新しいアポイント日時(ISO)。null なら未定 */
    appointmentAt: string | null;
    /** 変更前のアポイント日時(ISO)。新規作成時は undefined */
    previousAppointmentAt?: string | null;
    userId?: string | null;
    /** 案件の担当者(members.id)。自動登録する Todo の担当者にする */
    ownerId?: string | null;
  },
): Promise<void> {
  try {
    const { dealId, appointmentAt, previousAppointmentAt, userId, ownerId } = input;
    if (appointmentAt === previousAppointmentAt) return;
    const kindId = await appointmentKindId(db);
    if (!kindId) return;

    // 変更前の日時で未完了の「アポイント」Todo があれば、期限を新しい日時に合わせる(日時が消えたときはそのまま残す)
    if (previousAppointmentAt) {
      const { data: existing } = await db
        .from("deal_activities")
        .select("id")
        .eq("deal_id", dealId)
        .eq("kind_id", kindId)
        .is("done_at", null)
        .eq("due_at", previousAppointmentAt)
        .limit(1)
        .maybeSingle();
      if (existing) {
        if (appointmentAt) await db.from("deal_activities").update({ due_at: appointmentAt }).eq("id", existing.id);
        return;
      }
    }
    if (!appointmentAt) return;

    // 同じ日時の Todo が既にあれば二重に作らない
    const { data: dup } = await db
      .from("deal_activities")
      .select("id")
      .eq("deal_id", dealId)
      .eq("kind_id", kindId)
      .eq("due_at", appointmentAt)
      .limit(1)
      .maybeSingle();
    if (dup) return;
    await db.from("deal_activities").insert({
      deal_id: dealId,
      kind_id: kindId,
      body: "アポイント(案件作成時のアポイント日時から自動登録)",
      due_at: appointmentAt,
      done_at: null,
      author_id: userId ?? null,
      owner_id: ownerId ?? null,
    });
  } catch (e) {
    console.warn("[appointment-todo] 自動登録に失敗:", (e as Error).message);
  }
}
