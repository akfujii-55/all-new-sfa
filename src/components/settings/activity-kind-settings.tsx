"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { createActivityKind, deleteActivityKind, reorderActivityKinds, updateActivityKind } from "@/actions/activity-kinds";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ActivityKindIcon } from "@/components/deals/activity-kind-icon";
import { ReorderButtons, moveItem } from "@/components/settings/reorder-buttons";
import { ACTIVITY_ICONS, MAX_ACTIVITY_KINDS } from "@/lib/activity-kinds";
import { cn } from "@/lib/utils";
import type { ActivityKind } from "@/lib/types";

import { actionErrorMessage } from "@/lib/errors";
function IconSelect({ name, value, onChange }: { name: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1">
      {ACTIVITY_ICONS.map((i) => (
        <button
          key={i.key}
          type="button"
          title={i.label}
          onClick={() => onChange(i.key)}
          className={cn(
            "inline-flex size-7 items-center justify-center rounded-md border text-muted-foreground hover:bg-muted hover:text-foreground",
            value === i.key && "border-primary bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
          )}
          aria-label={i.label}
          aria-pressed={value === i.key}
        >
          <i.Icon className="size-4" />
        </button>
      ))}
      <input type="hidden" name={name} value={value} />
    </div>
  );
}

function KindRow({ kind, index, total, busy, onMove }: { kind: ActivityKind; index: number; total: number; busy: boolean; onMove: (delta: -1 | 1) => void }) {
  const [editing, setEditing] = useState(false);
  const [icon, setIcon] = useState(kind.icon);
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();

  if (!editing) {
    return (
      <div className="flex items-center gap-2 py-1.5">
        <ReorderButtons index={index} total={total} disabled={busy || pending} onMove={onMove} />
        <span className="inline-flex items-center gap-1.5 rounded-md border bg-background px-2.5 py-1 text-xs font-medium">
          <ActivityKindIcon icon={kind.icon} className="size-3.5" /> {kind.name}
        </span>
        <div className="ml-auto flex items-center gap-1">
          {confirm ? (
            <>
              <span className="text-xs text-muted-foreground">使われていない種類だけ削除できます</span>
              <Button size="sm" variant="destructive" disabled={pending} onClick={() => start(async () => { try { await deleteActivityKind(kind.id); toast.success("削除しました"); } catch (e) { toast.error(actionErrorMessage(e)); setConfirm(false); } })}>削除する</Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirm(false)}>やめる</Button>
            </>
          ) : (
            <>
              <Button size="sm" variant="ghost" onClick={() => setEditing(true)} aria-label="編集"><Pencil className="size-4" /></Button>
              <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setConfirm(true)} aria-label="削除"><Trash2 className="size-4" /></Button>
            </>
          )}
        </div>
      </div>
    );
  }
  return (
    <form
      className="flex flex-wrap items-center gap-2 py-1.5"
      action={(fd) =>
        start(async () => {
          try {
            await updateActivityKind(kind.id, fd);
            toast.success("保存しました");
            setEditing(false);
          } catch (e) {
            toast.error(actionErrorMessage(e));
          }
        })
      }
    >
      <Input name="name" defaultValue={kind.name} className="w-40" maxLength={30} required />
      <IconSelect name="icon" value={icon} onChange={setIcon} />
      <div className="ml-auto flex gap-1">
        <Button size="sm" variant="ghost" type="button" onClick={() => setEditing(false)}>キャンセル</Button>
        <Button size="sm" type="submit" disabled={pending}>保存</Button>
      </div>
    </form>
  );
}

/** 行動の種類の設定。追加・名前とアイコンの変更・削除・上下の並び替え(並び順は案件の「行動」の選択肢の順になる) */
export function ActivityKindSettings({ kinds }: { kinds: ActivityKind[] }) {
  const [order, setOrder] = useState(kinds);
  // サーバーから新しい一覧が来たら(追加・削除・保存後)並び順の state を差し替える
  const [prev, setPrev] = useState(kinds);
  if (prev !== kinds) {
    setPrev(kinds);
    setOrder(kinds);
  }
  const [icon, setIcon] = useState("other");
  const [pending, start] = useTransition();
  const full = order.length >= MAX_ACTIVITY_KINDS;

  function move(index: number, delta: -1 | 1) {
    const next = moveItem(order, index, delta);
    if (next === order) return;
    setOrder(next);
    start(async () => {
      try {
        await reorderActivityKinds(next.map((k) => k.id));
      } catch (e) {
        toast.error(actionErrorMessage(e));
        setOrder(kinds);
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="divide-y rounded-md border px-3">
        {order.length === 0 && <p className="py-3 text-sm text-muted-foreground">行動の種類がありません</p>}
        {order.map((k, i) => <KindRow key={k.id} kind={k} index={i} total={order.length} busy={pending} onMove={(d) => move(i, d)} />)}
      </div>
      <form
        id="activity-kind-create-form"
        className="flex flex-wrap items-center gap-2"
        action={(fd) =>
          start(async () => {
            try {
              await createActivityKind(fd);
              toast.success("種類を追加しました");
              (document.getElementById("activity-kind-create-form") as HTMLFormElement | null)?.reset();
              setIcon("other");
            } catch (e) {
              toast.error(actionErrorMessage(e));
            }
          })
        }
      >
        <Input name="name" placeholder="新しい種類の名前" className="w-40" maxLength={30} required disabled={full} />
        <IconSelect name="icon" value={icon} onChange={setIcon} />
        <Button size="sm" type="submit" disabled={pending || full}><Plus className="size-4" /> 追加</Button>
      </form>
      <p className="text-xs text-muted-foreground">
        行動の種類は {MAX_ACTIVITY_KINDS} 個まで(現在 {order.length} 個)。上下の矢印で並び替えると、案件の「行動」で選ぶときの順番になります。
        すでに行動で使われている種類は削除できません(名前とアイコンの変更はできます)。
      </p>
    </div>
  );
}
