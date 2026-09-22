import type { SupabaseClient } from "@supabase/supabase-js";
import { removeAttachmentObjects } from "@/lib/mail/attachments";

/**
 * メールのゴミ箱(0028)。削除は emails.deleted_at を入れるだけで、RLS の select が削除済みを隠す。
 * ゴミ箱画面はビュー email_trash を読み、復元・完全削除は DB 関数 email_trash_restore / email_trash_purge で行う。
 */

/** ゴミ箱に残す日数。これを過ぎたものは cron が完全に削除する */
export const TRASH_RETENTION_DAYS = 14;

/** 削除日時からゴミ箱に残る日数(0 以上) */
export function trashDaysLeft(deletedAt: string, now = new Date()): number {
  const passed = Math.floor((now.getTime() - new Date(deletedAt).getTime()) / 86_400_000);
  return Math.max(0, TRASH_RETENTION_DAYS - passed);
}

/** ゴミ箱のメールを id 指定で完全に削除する(添付の実体 → 行の順)。消した件数を返す */
export async function purgeEmails(db: SupabaseClient, ids: string[]): Promise<number> {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (unique.length === 0) return 0;
  await removeAttachmentObjects(db, unique);
  const { data, error } = await db.rpc("email_trash_purge", { p_ids: unique });
  if (error) throw error;
  return Number(data ?? 0);
}

/** 保持期間を過ぎたゴミ箱のメールを完全に削除する(cron 用)。消した件数を返す */
export async function purgeExpiredEmailTrash(db: SupabaseClient, now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - TRASH_RETENTION_DAYS * 86_400_000).toISOString();
  const { data, error } = await db.from("email_trash").select("id").lt("deleted_at", cutoff);
  if (error) throw error;
  return purgeEmails(db, (data ?? []).map((r) => r.id as string));
}
