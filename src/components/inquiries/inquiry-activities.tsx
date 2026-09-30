"use client";

import { useState } from "react";
import { CalendarCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DealActivities } from "@/components/deals/activities";
import { ActivityRow } from "@/components/deals/activity-row";
import { dueState, sortActivities } from "@/lib/activities";
import type { ActivityKind, DealActivity, Member } from "@/lib/types";

/** カードにそのまま並べる未完了の行動の件数(それ以上は「ほか n 件」にしてダイアログで見る) */
const INLINE_MAX = 3;

/**
 * 問い合わせの行動(Todo)。カードには未完了の行動を並べ(チェックで完了、担当者の付け替え)、
 * 「行動を追加」で登録・編集・履歴のダイアログを開く。中身は案件の「行動」タブと同じ部品。
 */
export function InquiryActivities({
  inquiry,
  activities,
  kinds,
  members,
  defaultOwnerId,
}: {
  inquiry: { id: string; subject: string; company?: { id: string; name: string } | null };
  activities: DealActivity[];
  kinds: Pick<ActivityKind, "id" | "name" | "icon">[];
  members: Pick<Member, "id" | "name">[];
  /** 新規登録の担当者の初期値(問い合わせの担当者 → 自分 → なし) */
  defaultOwnerId: string | null;
}) {
  const [open, setOpen] = useState(false);
  const todos = sortActivities(activities.filter((a) => !a.done_at));
  const overdue = todos.filter((a) => dueState(a) === "overdue").length;
  const doneCount = activities.length - todos.length;

  return (
    <div className="mt-2">
      {todos.length > 0 && (
        <div className="mb-1 divide-y rounded-md border px-3 py-2">
          {todos.slice(0, INLINE_MAX).map((a) => (
            <ActivityRow key={a.id} activity={{ ...a, inquiry }} showDeal={false} members={members} />
          ))}
          {todos.length > INLINE_MAX && (
            <button type="button" onClick={() => setOpen(true)} className="block w-full pt-2 text-left text-xs text-muted-foreground hover:text-foreground hover:underline">
              ほか {todos.length - INLINE_MAX} 件の行動を表示
            </button>
          )}
        </div>
      )}
      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-muted-foreground" onClick={() => setOpen(true)}>
        <CalendarCheck className="size-3.5" /> {activities.length > 0 ? "行動を追加・編集" : "行動(Todo)を追加"}
        {overdue > 0 && <Badge variant="destructive" className="ml-1 h-4 px-1 text-[10px]">期限超過 {overdue}</Badge>}
        {doneCount > 0 && <span className="ml-1 text-[11px]">完了 {doneCount} 件</span>}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>行動(Todo)</DialogTitle>
            <DialogDescription className="line-clamp-2">{inquiry.company?.name ? `${inquiry.company.name} / ` : ""}{inquiry.subject}</DialogDescription>
          </DialogHeader>
          <DealActivities inquiryId={inquiry.id} inquiry={inquiry} activities={activities} kinds={kinds} members={members} defaultOwnerId={defaultOwnerId} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
