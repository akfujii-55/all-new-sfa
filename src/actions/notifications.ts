"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { userError } from "@/lib/errors";
import { NOTIFICATION_LIST_LIMIT } from "@/lib/notifications-shared";
import type { Notification } from "@/lib/types";

/**
 * 担当者へのお知らせ(0036)。RLS で本人の分しか見えないので、テナントや recipient の絞り込みは不要。
 */
async function requireUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw userError("ログインが必要です");
  return { supabase, userId: data.user.id };
}

/** ベルのドロップダウン用: 新しい順(既読も含む) */
export async function listNotifications(): Promise<Notification[]> {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.from("notifications").select("*").order("created_at", { ascending: false }).limit(NOTIFICATION_LIST_LIMIT);
  if (error) throw userError(error.message);
  return (data ?? []) as Notification[];
}

/** 指定したお知らせ(省略なら未読すべて)を既読にする。件数を返す */
export async function markNotificationsRead(ids?: string[]): Promise<number> {
  const { supabase } = await requireUser();
  let q = supabase.from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null);
  if (ids && ids.length > 0) q = q.in("id", ids);
  else if (ids) return 0;
  const { error, data } = await q.select("id");
  if (error) throw userError(error.message);
  revalidatePath("/", "layout");
  return data?.length ?? 0;
}
