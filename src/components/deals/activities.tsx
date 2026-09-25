"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { AlertTriangle, CalendarClock, Check, Pencil, Trash2, UserRound } from "lucide-react";
import { addActivity, deleteActivity, setActivityDone, updateActivity } from "@/actions/activities";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/date-picker/date-picker";
import { dueState, sortActivities, type DueState } from "@/lib/activities";
import { fmtDateTime, fmtDue, toLocalInput } from "@/lib/format";
import type { ActivityKind, DealActivity, Member } from "@/lib/types";
import { cn } from "@/lib/utils";

import { ActivityKindIcon } from "./activity-kind-icon";
import { ActivityOwnerField } from "./activity-owner-select";
import { CalendarAddButton } from "./calendar-add-button";

import { actionErrorMessage } from "@/lib/errors";
const DUE_LABEL: Record<DueState, { text: string; className: string } | null> = {
  overdue: { text: "期限超過", className: "bg-rose-600 text-white" },
  today: { text: "今日", className: "bg-amber-500 text-white" },
  soon: { text: "まもなく", className: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200" },
  later: null,
  none: null,
  done: null,
};

type KindOption = Pick<ActivityKind, "id" | "name" | "icon">;

/** 種類の選択(設定画面で決めた順に並ぶ)。種類が 1 つも無いときは設定画面へ案内する */
function KindPicker({ kinds, value, onChange, idPrefix }: { kinds: KindOption[]; value: string; onChange: (id: string) => void; idPrefix: string }) {
  if (kinds.length === 0) {
    return <p className="text-xs text-muted-foreground">行動の種類がありません。<Link href="/settings" className="underline">設定</Link>で追加してください。</p>;
  }
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="行動の種類">
      {kinds.map((k) => {
        const active = value === k.id;
        return (
          <button
            key={k.id}
            id={`${idPrefix}-kind-${k.id}`}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(k.id)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
              active ? "border-primary bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <ActivityKindIcon icon={k.icon} className="size-3.5" /> {k.name}
          </button>
        );
      })}
    </div>
  );
}

export function DealActivities({
  dealId,
  deal,
  activities,
  kinds,
  members = [],
  defaultOwnerId = null,
}: {
  dealId: string;
  /** 「Google カレンダーに追加」の予定名・メモに使う案件名と取引先 */
  deal?: { id: string; title: string; company?: { name: string } | null } | null;
  activities: DealActivity[];
  kinds: KindOption[];
  /** 担当者の選択肢(自社の営業担当者) */
  members?: Pick<Member, "id" | "name">[];
  /** 新規登録の担当者の初期値(案件の担当者 → 自分 → なし) */
  defaultOwnerId?: string | null;
}) {
  const [pending, start] = useTransition();
  const ref = useRef<HTMLFormElement>(null);
  const [kind, setKind] = useState<string>(kinds[0]?.id ?? "");
  const [owner, setOwner] = useState<string | null>(defaultOwnerId);
  const [editing, setEditing] = useState<DealActivity | null>(null);
  const [editKind, setEditKind] = useState<string>(kinds[0]?.id ?? "");
  const [editOwner, setEditOwner] = useState<string | null>(null);
  // 退職などで選択肢に無い担当者が付いている行動を編集するときも、その名前を選択肢に出す
  const editMembers = editing?.owner_id && !members.some((m) => m.id === editing.owner_id) ? [...members, { id: editing.owner_id, name: editing.owner?.name ?? "(不明)" }] : members;
  // 登録後に期限の選択部品を初期状態に戻すためのキー(form.reset() では React の state は戻らない)
  const [formKey, setFormKey] = useState(0);
  const sorted = sortActivities(activities);
  const overdue = activities.filter((a) => dueState(a) === "overdue").length;
  const open = activities.filter((a) => !a.done_at).length;

  function run(fn: () => Promise<void>, ok?: string) {
    start(async () => {
      try {
        await fn();
        if (ok) toast.success(ok);
      } catch (e) {
        toast.error(actionErrorMessage(e));
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
              fd.set("kind_id", kind);
              await addActivity(dealId, fd);
              ref.current?.reset();
              setOwner(defaultOwnerId);
              setFormKey((k) => k + 1);
              toast.success("行動を登録しました");
            } catch (e) {
              toast.error(actionErrorMessage(e));
            }
          })
        }
      >
        <KindPicker kinds={kinds} value={kind} onChange={setKind} idPrefix="new" />
        <Textarea id="activity-body" name="body" rows={2} placeholder="内容(例: 見積書を送付。来週中に回答予定 / 部長に折り返し電話をもらう)" required />
        <div className="grid gap-1.5">
          <Label htmlFor="activity-due-open">期限(Todo の場合)</Label>
          <DatePicker key={formKey} name="due_at" mode="datetime" idPrefix="activity-due" emptyLabel="期限なし(履歴として記録)" />
        </div>
        {members.length > 0 && (
          <div className="grid gap-1.5">
            <Label htmlFor="activity-owner">担当者(誰がやるか)</Label>
            <ActivityOwnerField id="activity-owner" members={members} value={owner} onChange={setOwner} />
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
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
                  <span className="inline-flex items-center gap-1 font-medium text-foreground"><ActivityKindIcon icon={a.kind?.icon} className="size-3.5" /> {a.kind?.name ?? "(種類なし)"}</span>
                  {a.due_at && (
                    <span className={cn("inline-flex items-center gap-1 text-muted-foreground", state === "overdue" && "text-rose-700 dark:text-rose-300 font-medium")}>
                      <CalendarClock className="size-3.5" /> 期限 {fmtDue(a.due_at)}
                    </span>
                  )}
                  {due && <Badge className={cn("h-5 px-1.5 text-[10px]", due.className)}>{due.text}</Badge>}
                  {a.owner?.name && <span className="inline-flex items-center gap-1 font-semibold text-foreground"><UserRound className="size-3.5 text-muted-foreground" /> {a.owner.name}</span>}
                  {done && <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-300"><Check className="size-3.5" /> 完了 {fmtDateTime(a.done_at)}</span>}
                  <span className="ml-auto text-muted-foreground">{a.author?.full_name ?? ""} · {fmtDateTime(a.created_at)}</span>
                </div>
                <p className={cn("mt-1 whitespace-pre-wrap text-sm", done && "line-through")}>{a.body}</p>
              </div>
              <CalendarAddButton activity={a} deal={deal} />
              <div className="flex shrink-0 gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100">
                <Button size="sm" variant="ghost" aria-label="編集" disabled={pending} onClick={() => { setEditing(a); setEditKind(a.kind_id); setEditOwner(a.owner_id ?? null); }}><Pencil className="size-3.5" /></Button>
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
                    fd.set("kind_id", editKind);
                    await updateActivity(editing.id, dealId, fd);
                    setEditing(null);
                    toast.success("保存しました");
                  } catch (e) {
                    toast.error(actionErrorMessage(e));
                  }
                })
              }
            >
              <KindPicker kinds={kinds} value={editKind} onChange={setEditKind} idPrefix="edit" />
              <Textarea id="edit-activity-body" name="body" rows={3} defaultValue={editing.body} required />
              <div className="grid gap-1.5">
                <Label htmlFor="edit-activity-due-open">期限</Label>
                <DatePicker name="due_at" mode="datetime" idPrefix="edit-activity-due" defaultValue={toLocalInput(editing.due_at)} emptyLabel="期限なし" />
              </div>
              {(editMembers.length > 0 || editing.owner_id) && (
                <div className="grid gap-1.5">
                  <Label htmlFor="edit-activity-owner">担当者</Label>
                  <ActivityOwnerField id="edit-activity-owner" members={editMembers} value={editOwner} onChange={setEditOwner} />
                </div>
              )}
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
