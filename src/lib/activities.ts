import { TZDate } from "@date-fns/tz";
import { APP_TZ } from "@/lib/format";
import type { DealActivity } from "@/lib/types";

export type DueState = "overdue" | "today" | "soon" | "later" | "none" | "done";

/** 期限の状態。期限超過 → 今日 → 3 日以内 → それ以降 → 期限なし。完了済みは done */
export function dueState(a: Pick<DealActivity, "due_at" | "done_at">, now: Date = new Date()): DueState {
  if (a.done_at) return "done";
  if (!a.due_at) return "none";
  const due = new Date(a.due_at);
  if (due.getTime() < now.getTime()) return "overdue";
  // 「今日」は日本時間で判定する(サーバーは UTC で動くため)
  const n = new TZDate(now.getTime(), APP_TZ);
  const endOfToday = new TZDate(n.getFullYear(), n.getMonth(), n.getDate(), 23, 59, 59, APP_TZ);
  if (due.getTime() <= endOfToday.getTime()) return "today";
  if (due.getTime() - now.getTime() <= 3 * 24 * 60 * 60 * 1000) return "soon";
  return "later";
}

export function isOverdue(a: Pick<DealActivity, "due_at" | "done_at">, now: Date = new Date()): boolean {
  return dueState(a, now) === "overdue";
}

/** 表示順: 未完了(期限超過 → 期限が近い順 → 期限なし)→ 完了(新しい順) */
export function sortActivities(list: DealActivity[]): DealActivity[] {
  const key = (a: DealActivity) => {
    if (a.done_at) return [2, -new Date(a.done_at).getTime()];
    if (a.due_at) return [0, new Date(a.due_at).getTime()];
    return [1, -new Date(a.created_at).getTime()];
  };
  return [...list].sort((x, y) => {
    const [gx, tx] = key(x);
    const [gy, ty] = key(y);
    return gx !== gy ? gx - gy : tx - ty;
  });
}

/** 今から n 日後(ダッシュボードの「期限が近い行動」の範囲) */
export function daysAhead(days: number, now: Date = new Date()): string {
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

/** 今の時刻(ISO)。サーバーコンポーネント内で Date.now() を直接呼ばないための薄いラッパー */
export function nowIso(): string {
  return new Date().toISOString();
}

export const DUE_GROUPS: { key: DueState; label: string }[] = [
  { key: "overdue", label: "期限超過" },
  { key: "today", label: "今日" },
  { key: "soon", label: "3 日以内" },
  { key: "later", label: "それ以降" },
  { key: "none", label: "期限なし" },
];

/** 一覧ページ用に、未完了の行動を期限の状態ごとに分ける(各グループ内は期限順) */
export function groupByDue(list: DealActivity[], now: Date = new Date()): { key: DueState; label: string; items: DealActivity[] }[] {
  const sorted = sortActivities(list);
  return DUE_GROUPS.map((g) => ({ ...g, items: sorted.filter((a) => dueState(a, now) === g.key) }));
}

/** 過ぎたアポイントをカンバンで赤くするまでの日数 */
export const APPOINTMENT_STALE_DAYS = 14;

/**
 * アポイント日時の状態(カンバンのカード用)。days は日本時間の日付で数えた経過日数(未来なら負)。
 * 過ぎたアポは「n 日経過」を出し、APPOINTMENT_STALE_DAYS を超えたら進んでいない案件として強調する。
 */
export function appointmentState(appointmentAt: string, now: Date = new Date()): { past: boolean; today: boolean; days: number; stale: boolean } {
  const n = new TZDate(now.getTime(), APP_TZ);
  const a = new TZDate(new Date(appointmentAt).getTime(), APP_TZ);
  const todayStart = new TZDate(n.getFullYear(), n.getMonth(), n.getDate(), APP_TZ).getTime();
  const apptStart = new TZDate(a.getFullYear(), a.getMonth(), a.getDate(), APP_TZ).getTime();
  const days = Math.round((todayStart - apptStart) / (24 * 60 * 60 * 1000));
  return { past: days > 0, today: days === 0, days, stale: days > APPOINTMENT_STALE_DAYS };
}
