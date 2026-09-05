"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { yen } from "@/lib/format";
import type { RevenueLine } from "@/actions/deals";

export function toMonthInput(yearMonth: string) {
  return yearMonth.slice(0, 7);
}
export function fromMonthInput(v: string) {
  return v ? `${v}-01` : "";
}

export function RevenueLinesEditor({ lines, onChange }: { lines: RevenueLine[]; onChange: (l: RevenueLine[]) => void }) {
  const total = lines.reduce((a, l) => a + (Number(l.amount) || 0), 0);
  function update(i: number, patch: Partial<RevenueLine>) {
    onChange(lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[1fr_1fr_1.2fr_auto] gap-2 text-xs text-muted-foreground px-1">
        <span>計上月</span><span>金額(円)</span><span>メモ</span><span />
      </div>
      {lines.map((l, i) => (
        <div key={i} className="grid grid-cols-[1fr_1fr_1.2fr_auto] gap-2">
          <Input type="month" value={toMonthInput(l.year_month)} onChange={(e) => update(i, { year_month: fromMonthInput(e.target.value) })} />
          <Input inputMode="numeric" value={l.amount || ""} onChange={(e) => update(i, { amount: Number(e.target.value.replace(/[^\d]/g, "")) || 0 })} />
          <Input value={l.memo ?? ""} onChange={(e) => update(i, { memo: e.target.value })} placeholder="初期費用 など" />
          <Button type="button" variant="ghost" size="icon" onClick={() => onChange(lines.filter((_, idx) => idx !== i))} disabled={lines.length === 1}>
            <Trash2 className="size-4" />
          </Button>
        </div>
      ))}
      <div className="flex items-center justify-between pt-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            const last = lines[lines.length - 1];
            const d = last?.year_month ? new Date(last.year_month) : new Date();
            d.setMonth(d.getMonth() + 1);
            onChange([...lines, { year_month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`, amount: 0, memo: "" }]);
          }}
        >
          <Plus className="size-4" /> 月を追加
        </Button>
        <span className="text-sm">合計 <span className="font-semibold tabular-nums">{yen(total)}</span></span>
      </div>
    </div>
  );
}
