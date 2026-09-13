"use client";

import { useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Building2, CalendarClock, KanbanSquare } from "lucide-react";
import { setActivityDone } from "@/actions/activities";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ActivityKindIcon } from "@/components/deals/activity-kind-icon";
import { dueState, type DueState } from "@/lib/activities";
import { fmtDateTime } from "@/lib/format";
import { ACTIVITY_KIND_LABEL, type DealActivity } from "@/lib/types";
import { cn } from "@/lib/utils";

const DUE_CHIP: Record<DueState, { text: string; className: string } | null> = {
  overdue: { text: "期限超過", className: "bg-rose-600 text-white" },
  today: { text: "今日", className: "bg-amber-500 text-white" },
  soon: { text: "まもなく", className: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200" },
  later: null,
  none: null,
  done: null,
};

/**
 * ダッシュボードと行動一覧で使う 1 行。主役は「何をするか」(種類と内容)、副情報が案件と取引先。
 * 左のチェックでその場で完了にできる。
 */
export function ActivityRow({ activity: a, showDeal = true }: { activity: DealActivity; showDeal?: boolean }) {
  const [pending, start] = useTransition();
  const state = dueState(a);
  const chip = DUE_CHIP[state];
  const done = Boolean(a.done_at);
  return (
    <div className={cn("flex items-start gap-3 py-2.5 first:pt-0 last:pb-0", done && "opacity-60")}>
      <Checkbox
        id={`row-done-${a.id}`}
        className="mt-1"
        checked={done}
        disabled={pending}
        aria-label={done ? "未完了に戻す" : "完了にする"}
        onCheckedChange={(v) =>
          start(async () => {
            try {
              await setActivityDone(a.id, a.deal_id, v === true);
              toast.success(v === true ? "完了にしました" : "未完了に戻しました");
            } catch (e) {
              toast.error((e as Error).message);
            }
          })
        }
      />
      <div className="min-w-0 flex-1">
        <p className={cn("text-sm leading-snug", done && "line-through")}>
          <span className="mr-1.5 inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-xs font-medium align-[1px]">
            <ActivityKindIcon kind={a.kind} className="size-3" /> {ACTIVITY_KIND_LABEL[a.kind]}
          </span>
          {a.body}
        </p>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          {showDeal && a.deal && (
            <Link href={`/deals/${a.deal.id}`} className="inline-flex items-center gap-1 hover:underline">
              <KanbanSquare className="size-3" /> {a.deal.title}
            </Link>
          )}
          {showDeal && a.deal?.company?.name && (
            <span className="inline-flex items-center gap-1"><Building2 className="size-3" /> {a.deal.company.name}</span>
          )}
          {a.due_at && (
            <span className={cn("inline-flex items-center gap-1", state === "overdue" && "font-medium text-rose-600 dark:text-rose-300", state === "today" && "font-medium text-amber-600 dark:text-amber-300")}>
              <CalendarClock className="size-3" /> 期限 {fmtDateTime(a.due_at)}
            </span>
          )}
        </p>
      </div>
      {chip && <Badge className={cn("shrink-0 h-5 px-1.5 text-[10px]", chip.className)}>{chip.text}</Badge>}
    </div>
  );
}
