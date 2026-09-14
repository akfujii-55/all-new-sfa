"use client";

import { useSyncExternalStore } from "react";
import { CalendarPlus } from "lucide-react";
import { googleCalendarUrl } from "@/lib/calendar-link";
import type { DealActivity } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * 「Google カレンダーに追加」。期限のある未完了の行動にだけ出す。
 * 新しいタブで Google カレンダーの予定作成画面が開き、内容を確認して保存する。
 */
export function CalendarAddButton({
  activity,
  deal,
  className,
}: {
  activity: Pick<DealActivity, "body" | "due_at" | "done_at" | "kind">;
  deal: { id: string; title: string; company?: { name: string } | null } | null | undefined;
  className?: string;
}) {
  // 案件ページの URL に使うオリジンはマウント後に取る(描画中に window を見るとサーバーの HTML と食い違う)
  const origin = useSyncExternalStore(subscribeNoop, () => window.location.origin, () => "");
  if (!activity.due_at || activity.done_at) return null;
  const href = googleCalendarUrl(activity, deal, origin);
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title="Google カレンダーに追加"
      aria-label="Google カレンダーに追加"
      className={cn("inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground", className)}
    >
      <CalendarPlus className="size-3.5" />
    </a>
  );
}

function subscribeNoop() {
  return () => {};
}
