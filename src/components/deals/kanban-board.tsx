"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { DndContext, DragOverlay, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { toast } from "sonner";
import { AlertTriangle, Building2, CalendarClock, GripVertical, UserCog } from "lucide-react";
import { moveDealStage } from "@/actions/deals";
import { DEAL_STAGES, type Deal, type DealStage, type OpenTodo } from "@/lib/types";
import { fmtDate, fmtDue, yen } from "@/lib/format";
import { appointmentState, dueState } from "@/lib/activities";
import { useLocalPref } from "@/lib/local-pref";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { WonDialog, LostDialog } from "./stage-dialogs";

import { actionErrorMessage } from "@/lib/errors";
export function KanbanBoard({ deals: initial }: { deals: Deal[] }) {
  const [deals, setDeals] = useState(initial);
  const [prevInitial, setPrevInitial] = useState(initial);
  if (prevInitial !== initial) {
    setPrevInitial(initial);
    setDeals(initial);
  }
  const [active, setActive] = useState<Deal | null>(null);
  const [wonTarget, setWonTarget] = useState<Deal | null>(null);
  const [lostTarget, setLostTarget] = useState<Deal | null>(null);
  const [, start] = useTransition();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  // カードに出す未完了 Todo の件数(ブラウザごとに記憶)
  const [todoLimit, setTodoLimit] = useLocalPref("kanban_todo_limit", "3", TODO_LIMITS);

  function onDragStart(e: DragStartEvent) {
    setActive(deals.find((d) => d.id === e.active.id) ?? null);
  }

  function onDragEnd(e: DragEndEvent) {
    setActive(null);
    const dealId = String(e.active.id);
    const stage = e.over?.id as DealStage | undefined;
    const deal = deals.find((d) => d.id === dealId);
    if (!deal || !stage || deal.stage === stage) return;

    if (stage === "won") return setWonTarget(deal);
    if (stage === "lost") return setLostTarget(deal);

    const before = deals;
    setDeals(deals.map((d) => (d.id === dealId ? { ...d, stage } : d)));
    start(async () => {
      try {
        await moveDealStage(dealId, stage);
      } catch (err) {
        setDeals(before);
        toast.error(actionErrorMessage(err));
      }
    });
  }

  return (
    <>
      <div className="mb-2 flex items-center justify-end gap-1 text-xs text-muted-foreground">
        <span className="mr-1">カードの Todo</span>
        {TODO_LIMITS.map((n) => (
          <Button key={n} size="sm" variant={todoLimit === n ? "secondary" : "ghost"} className="h-7 px-2 text-xs" onClick={() => setTodoLimit(n)} aria-pressed={todoLimit === n}>
            {n === "0" ? "件数だけ" : `${n} 件まで`}
          </Button>
        ))}
      </div>
      <DndContext id="deal-kanban" sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-4 -mx-4 px-4 md:-mx-6 md:px-6">
          {DEAL_STAGES.map((s) => {
            const items = deals.filter((d) => d.stage === s.key).sort((a, b) => a.sort_order - b.sort_order || b.updated_at.localeCompare(a.updated_at));
            const total = items.reduce((a, d) => a + Number(d.amount), 0);
            return <Column key={s.key} stage={s} items={items} total={total} todoLimit={Number(todoLimit)} />;
          })}
        </div>
        <DragOverlay>{active ? <DealCard deal={active} todoLimit={Number(todoLimit)} overlay /> : null}</DragOverlay>
      </DndContext>

      <WonDialog
        deal={wonTarget}
        open={!!wonTarget}
        onOpenChange={(o) => !o && setWonTarget(null)}
        onDone={() => wonTarget && setDeals(deals.map((d) => (d.id === wonTarget.id ? { ...d, stage: "won" } : d)))}
      />
      <LostDialog
        deal={lostTarget}
        open={!!lostTarget}
        onOpenChange={(o) => !o && setLostTarget(null)}
        onDone={() => lostTarget && setDeals(deals.map((d) => (d.id === lostTarget.id ? { ...d, stage: "lost" } : d)))}
      />
    </>
  );
}

const TODO_LIMITS = ["3", "1", "0"] as const;

function Column({ stage, items, total, todoLimit }: { stage: (typeof DEAL_STAGES)[number]; items: Deal[]; total: number; todoLimit: number }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.key });
  return (
    <div className="flex w-72 shrink-0 flex-col">
      <div className="mb-2 flex items-center justify-between px-1">
        <div className="flex items-center gap-2 text-sm font-medium">
          <span className={cn("size-2.5 rounded-full", stage.color)} />
          {stage.label}
          <span className="text-muted-foreground">{items.length}</span>
        </div>
        <span className="text-xs text-muted-foreground tabular-nums">{yen(total)}</span>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "flex-1 min-h-[60vh] rounded-lg border bg-muted/40 p-2 space-y-2 transition-colors",
          isOver && "bg-accent border-primary/40",
        )}
      >
        {items.map((d) => <DraggableCard key={d.id} deal={d} todoLimit={todoLimit} />)}
        {items.length === 0 && <p className="py-8 text-center text-xs text-muted-foreground">ここにドロップ</p>}
      </div>
    </div>
  );
}

function DraggableCard({ deal, todoLimit }: { deal: Deal; todoLimit: number }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: deal.id });
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} className={cn(isDragging && "opacity-40")}>
      <DealCard deal={deal} todoLimit={todoLimit} />
    </div>
  );
}

/** アポ日時の行。これからのアポは青、過ぎたアポは経過日数付き(APPOINTMENT_STALE_DAYS を超えると赤)で、ステージに関係なく出す */
function AppointmentLine({ appointmentAt }: { appointmentAt: string }) {
  const st = appointmentState(appointmentAt);
  if (st.past) {
    return (
      <p className={cn("mt-1.5 flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground", st.stale && "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300")}>
        <CalendarClock className="size-3" /> アポ {fmtDate(appointmentAt, "M/d")}
        <span className={cn("font-semibold", st.stale ? "text-rose-600 dark:text-rose-300" : "text-amber-600 dark:text-amber-300")}>· {st.days} 日経過</span>
      </p>
    );
  }
  return (
    <p className="mt-1.5 flex items-center gap-1 rounded bg-sky-50 px-1.5 py-0.5 text-[11px] font-medium text-sky-700 dark:bg-sky-950/40 dark:text-sky-300">
      <CalendarClock className="size-3" /> アポ {fmtDate(appointmentAt, "M/d HH:mm")}{st.today && " · 今日"}
    </p>
  );
}

/** 未完了 Todo の 1 行(種類・内容・期限)。期限超過は赤、今日は黄色 */
function TodoLine({ todo }: { todo: OpenTodo }) {
  const st = dueState({ due_at: todo.due_at, done_at: null });
  return (
    <p className="grid grid-cols-[auto_1fr_auto] items-baseline gap-1.5 text-[11px] leading-snug">
      {todo.kind_name && <span className="rounded bg-muted px-1 text-[10px] text-muted-foreground">{todo.kind_name}</span>}
      {!todo.kind_name && <span />}
      <span className="min-w-0 truncate">{todo.body}</span>
      <span className={cn("tabular-nums text-muted-foreground", st === "overdue" && "font-semibold text-rose-600 dark:text-rose-300", st === "today" && "font-semibold text-amber-600 dark:text-amber-300")}>
        {fmtDue(todo.due_at).replace(/^\d{4}\//, "")}
      </span>
    </p>
  );
}

function DealCard({ deal, todoLimit, overlay }: { deal: Deal; todoLimit: number; overlay?: boolean }) {
  const todos = deal.open_todos ?? [];
  return (
    <div className={cn("group rounded-md border bg-card p-3 shadow-xs", overlay && "shadow-lg rotate-1 cursor-grabbing")}>
      <div className="flex items-start gap-2">
        <GripVertical className="mt-0.5 size-4 shrink-0 text-muted-foreground/50 cursor-grab" />
        <div className="min-w-0 flex-1">
          <Link href={`/deals/${deal.id}`} className="block text-sm font-medium leading-snug hover:underline line-clamp-2" onPointerDown={(e) => e.stopPropagation()}>
            {deal.title}
          </Link>
          <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground truncate">
            <Building2 className="size-3" /> {deal.company?.name ?? "-"}
          </p>
          {deal.owner?.name && (
            <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground truncate">
              <UserCog className="size-3" /> {deal.owner.name}
            </p>
          )}
          <div className="mt-2 flex items-center justify-between">
            <span className="text-sm font-semibold tabular-nums">{yen(deal.amount)}</span>
            <Badge variant="secondary" className="text-[10px]">{deal.probability}%</Badge>
          </div>
          {((deal.overdue_activities ?? 0) > 0 || (deal.today_activities ?? 0) > 0) && (
            <p className="mt-1.5 flex flex-wrap items-center gap-1 text-[11px]">
              {(deal.overdue_activities ?? 0) > 0 && (
                <span className="inline-flex items-center gap-1 rounded bg-rose-600 px-1.5 py-0.5 font-medium text-white"><AlertTriangle className="size-3" /> 期限超過 {deal.overdue_activities}</span>
              )}
              {(deal.today_activities ?? 0) > 0 && (
                <span className="inline-flex items-center gap-1 rounded bg-amber-500 px-1.5 py-0.5 font-medium text-white">今日 {deal.today_activities}</span>
              )}
            </p>
          )}
          {deal.appointment_at ? (
            <AppointmentLine appointmentAt={deal.appointment_at} />
          ) : deal.expected_close_date ? (
            <p className="mt-1.5 flex items-center gap-1 text-[11px] text-muted-foreground">
              <CalendarClock className="size-3" /> 受注予定 {fmtDate(deal.expected_close_date, "M/d")}
            </p>
          ) : null}
          {todoLimit > 0 && todos.length > 0 && (
            <div className="mt-1.5 space-y-0.5 border-t border-dashed pt-1.5">
              {todos.slice(0, todoLimit).map((t) => <TodoLine key={t.id} todo={t} />)}
              {todos.length > todoLimit && <p className="text-[10px] text-muted-foreground">ほか {todos.length - todoLimit} 件</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
