"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";

/** 一覧の 1 行を上下に動かすボタン(タグ・行動の種類の並び替え) */
export function ReorderButtons({ index, total, disabled, onMove }: { index: number; total: number; disabled?: boolean; onMove: (delta: -1 | 1) => void }) {
  return (
    <div className="flex flex-col">
      <Button size="icon-xs" variant="ghost" className="h-4 w-6" disabled={disabled || index === 0} onClick={() => onMove(-1)} aria-label="上へ"><ChevronUp className="size-3.5" /></Button>
      <Button size="icon-xs" variant="ghost" className="h-4 w-6" disabled={disabled || index >= total - 1} onClick={() => onMove(1)} aria-label="下へ"><ChevronDown className="size-3.5" /></Button>
    </div>
  );
}

/** 配列の index の要素を delta だけ動かした新しい配列 */
export function moveItem<T>(list: T[], index: number, delta: -1 | 1): T[] {
  const to = index + delta;
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(index, 1);
  next.splice(to, 0, item);
  return next;
}
