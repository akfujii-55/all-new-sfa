"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { AlertTriangle, CalendarClock, Check, Pencil, Trash2 } from "lucide-react";
import { addActivity, deleteActivity, setActivityDone, updateActivity } from "@/actions/activities";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { dueState, sortActivities, type DueState } from "@/lib/activities";
import { fmtDateTime, toLocalInput } from "@/lib/format";
import { ACTIVITY_KINDS, type ActivityKind, type DealActivity } from "@/lib/types";
import { cn } from "@/lib/utils";

import { ActivityKindIcon } from "./activity-kind-icon";

const DUE_LABEL: Record<DueState, { text: string; className: string } | null> = {
  overdue: { text: "期限超過", className: "bg-rose-600 text-white" },
  today: { text: "今日", className: "bg-amber-500 text-white" },
  soon: { text: "まもなく", className: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200" },
  later: null,
  none: null,
  done: null,
};

function KindPicker({ value, onChange, idPrefix }: { value: ActivityKind; onChange: (k: ActivityKind) => void; idPrefix: string }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="行動の種類">
      {ACTIVITY_KINDS.map((k) => {
        const active = value === k.key;
        return (
          <button
            key={k.key}
            id={`${idPrefix}-kind-${k.key}`}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(k.key)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
              active ? "border-primary bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <ActivityKindIcon kind={k.key} className="size-3.5" /> {k.label}
          </button>
        );
      })}
    </div>
  );
}

export function DealActivities({ dealId, activities }: { dealId: string; activities: DealActivity[] }) {
  const [pending, start] = useTransition();
  const ref = useRef<HTMLFormElement>(null);
  const [kind, setKind] = useState<ActivityKind>("call");
  const [editing, setEditing] = useState<DealActivity | null>(null);
  const [editKind, setEditKind] = useState<ActivityKind>("call");
  const sorted = sortActivities(activities);
  const overdue = activities.filter((a) => dueState(a) === "overdue").length;
  const open = activities.filter((a) => !a.done_at).length;

  function run(fn: () => Promise<void>, ok?: string) {
    start(async () => {
      try {
        await fn();
        if (ok) toast.success(ok);
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  }

  return (
    <div className="space-y-5">
      {overdue > 0 && (
        <div className="flex items-center gap-2 rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
          <AlertTriangle className="size-4 shrink-0" /> 期限を過ぎた行動が {overdue} 件あります。対応したら完了にチェックを付けてください。
        </div>
      )}

      <form
        ref={ref}
        className="space-y-3 rounded-md border p-3"
        action={(fd) =>
          start(async () => {
            try {
              fd.set("kind", kind);
              await addActivity(dealId, fd);
              ref.current?.reset();
              toast.success("行動を登録しました");
            } catch (e) {
              toast.error((e as Error).message);
            }
          })
        }
      >
        <KindPicker value={kind} onChange={setKind} idPrefix="new" />
        <Textarea id="activity-body" name="body" rows={2} placeholder="内容(例: 見積書を送付。来週中に回答予定 / 部長に折り返し電話をもらう)" required />
        <div className="flex flex-wrap items-end gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="activity-due">期限(Todo の場合)</Label>
            <Input id="activity-due" name="due_at" type="datetime-local" className="w-56" />
          </div>
          <label className="flex items-center gap-2 pb-2 text-sm">
            <Checkbox name="done" id="activity-done" /> 済んだ行動として記録する
          </label>
          <Button type="submit" size="sm" className="ml-auto" disabled={pending}>{pending ? "登録中..." : "登録"}</Button>
        </div>
      </form>

      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">未完了 {open} 件 / 全 {activities.length} 件</p>
        {sorted.length === 0 && <p className="text-sm text-muted-foreground">まだ行動はありません。電話・メール・訪問の記録や、期限付きの Todo を登録してください。</p>}
        {sorted.map((a) => {
          const state = dueState(a);
          const due = DUE_LABEL[state];
          const done = Boolean(a.done_at);
          return (
            <div
              key={a.id}
              className={cn(
                "group flex items-start gap-3 rounded-md border p-3",
                state === "overdue" && "border-rose-300 bg-rose-50/60 dark:border-rose-900 dark:bg-rose-950/30",
                state === "today" && "border-amber-300 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/30",
                done && "opacity-60",
              )}
            >
              <Checkbox
                id={`activity-done-${a.id}`}
                className="mt-1"
                checked={done}
                disabled={pending}
                aria-label={done ? "未完了に戻す" : "完了にする"}
                onCheckedChange={(v) => run(() => setActivityDone(a.id, dealId, v === true), v === true ? "完了にしました" : "未完了に戻しました")}
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="inline-flex items-center gap-1 font-medium text-foreground"><ActivityKindIcon kind={a.kind} className="size-3.5" /> {ACTIVITY_KINDS.find((k) => k.key === a.kind)?.label}</span>
                  {a.due_at && (
                    <span className={cn("inline-flex items-center gap-1 text-muted-foreground", state === "overdue" && "text-rose-700 dark:text-rose-300 font-medium")}>
                      <CalendarClock className="size-3.5" /> 期限 {fmtDateTime(a.due_at)}
                    </span>
                  )}
                  {due && <Badge className={cn("h-5 px-1.5 text-[10px]", due.className)}>{due.text}</Badge>}
                  {done && <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-300"><Check className="size-3.5" /> 完了 {fmtDateTime(a.done_at)}</span>}
                  <span className="ml-auto text-muted-foreground">{a.author?.full_name ?? ""} · {fmtDateTime(a.created_at)}</span>
                </div>
                <p className={cn("mt-1 whitespace-pre-wrap text-sm", done && "line-through")}>{a.body}</p>
              </div>
              <div className="flex shrink-0 gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100">
                <Button size="sm" variant="ghost" aria-label="編集" disabled={pending} onClick={() => { setEditing(a); setEditKind(a.kind); }}><Pencil className="size-3.5" /></Button>
                <Button size="sm" variant="ghost" className="text-destructive" aria-label="削除" disabled={pending} onClick={() => run(() => deleteActivity(a.id, dealId), "削除しました")}><Trash2 className="size-3.5" /></Button>
              </div>
            </div>
          );
        })}
      </div>

      <Dialog open={Boolean(editing)} onOpenChange={(o) => { if (!o) setEditing(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>行動を編集</DialogTitle></DialogHeader>
          {editing && (
            <form
              className="space-y-3"
              action={(fd) =>
                start(async () => {
                  try {
                    fd.set("kind", editKind);
                    await updateActivity(editing.id, dealId, fd);
                    setEditing(null);
                    toast.success("保存しました");
                  } catch (e) {
                    toast.error((e as Error).message);
                  }
                })
              }
            >
              <KindPicker value={editKind} onChange={setEditKind} idPrefix="edit" />
              <Textarea id="edit-activity-body" name="body" rows={3} defaultValue={editing.body} required />
              <div className="grid gap-1.5">
                <Label htmlFor="edit-activity-due">期限</Label>
                <Input id="edit-activity-due" name="due_at" type="datetime-local" className="w-56" defaultValue={toLocalInput(editing.due_at)} />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditing(null)}>キャンセル</Button>
                <Button type="submit" disabled={pending}>{pending ? "保存中..." : "保存"}</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
