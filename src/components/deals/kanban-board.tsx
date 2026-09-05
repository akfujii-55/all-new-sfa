"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { DndContext, DragOverlay, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { toast } from "sonner";
import { Building2, CalendarClock, GripVertical } from "lucide-react";
import { moveDealStage } from "@/actions/deals";
import { DEAL_STAGES, type Deal, type DealStage } from "@/lib/types";
import { fmtDate, yen } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { WonDialog, LostDialog } from "./stage-dialogs";

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
        toast.error((err as Error).message);
      }
    });
  }

  return (
    <>
      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-4 -mx-4 px-4 md:-mx-6 md:px-6">
          {DEAL_STAGES.map((s) => {
            const items = deals.filter((d) => d.stage === s.key).sort((a, b) => a.sort_order - b.sort_order || b.updated_at.localeCompare(a.updated_at));
            const total = items.reduce((a, d) => a + Number(d.amount), 0);
            return <Column key={s.key} stage={s} items={items} total={total} />;
          })}
        </div>
        <DragOverlay>{active ? <DealCard deal={active} overlay /> : null}</DragOverlay>
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

function Column({ stage, items, total }: { stage: (typeof DEAL_STAGES)[number]; items: Deal[]; total: number }) {
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
        {items.map((d) => <DraggableCard key={d.id} deal={d} />)}
        {items.length === 0 && <p className="py-8 text-center text-xs text-muted-foreground">ここにドロップ</p>}
      </div>
    </div>
  );
}

function DraggableCard({ deal }: { deal: Deal }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: deal.id });
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} className={cn(isDragging && "opacity-40")}>
      <DealCard deal={deal} />
    </div>
  );
}

function DealCard({ deal, overlay }: { deal: Deal; overlay?: boolean }) {
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
          <div className="mt-2 flex items-center justify-between">
            <span className="text-sm font-semibold tabular-nums">{yen(deal.amount)}</span>
            <Badge variant="secondary" className="text-[10px]">{deal.probability}%</Badge>
          </div>
          {(deal.appointment_at || deal.expected_close_date) && (
            <p className="mt-1.5 flex items-center gap-1 text-[11px] text-muted-foreground">
              <CalendarClock className="size-3" />
              {deal.stage === "appointment" && deal.appointment_at ? `アポ ${fmtDate(deal.appointment_at, "M/d HH:mm")}` : deal.expected_close_date ? `受注予定 ${fmtDate(deal.expected_close_date, "M/d")}` : ""}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
