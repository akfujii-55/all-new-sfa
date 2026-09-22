/**
 * メールのゴミ箱の定数と表示用の計算(クライアント部品からも読むので、サーバー専用のものは import しない)。
 * 移動・復元・完全削除の実処理は src/lib/mail/trash.ts。
 */

/** ゴミ箱に残す日数。これを過ぎたものは cron が完全に削除する */
export const TRASH_RETENTION_DAYS = 14;

/** 削除日時からゴミ箱に残る日数(0 以上) */
export function trashDaysLeft(deletedAt: string, now = new Date()): number {
  const passed = Math.floor((now.getTime() - new Date(deletedAt).getTime()) / 86_400_000);
  return Math.max(0, TRASH_RETENTION_DAYS - passed);
}
