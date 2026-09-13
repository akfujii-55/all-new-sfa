"use client";

import { useMemo, useState } from "react";
import { Check } from "lucide-react";
import { Input } from "@/components/ui/input";

export interface PickerItem {
  id: string;
  label: string;
  sub?: string | null;
}

/** 名前で絞り込んで 1 件選ぶリスト(担当者・取引先が多くても探せるように Select ではなく検索付きにする) */
export function PickerList({ items, value, onChange, placeholder = "名前で検索", emptyText = "該当なし" }: { items: PickerItem[]; value: string | null; onChange: (id: string) => void; placeholder?: string; emptyText?: string }) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    const list = t ? items.filter((i) => i.label.toLowerCase().includes(t) || (i.sub ?? "").toLowerCase().includes(t)) : items;
    return list.slice(0, 200);
  }, [items, q]);
  return (
    <div className="space-y-2">
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} autoFocus />
      <div className="max-h-56 overflow-y-auto rounded-md border">
        {filtered.length === 0 ? (
          <p className="p-3 text-sm text-muted-foreground">{emptyText}</p>
        ) : (
          filtered.map((i) => (
            <button
              key={i.id}
              type="button"
              onClick={() => onChange(i.id)}
              className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted ${value === i.id ? "bg-muted" : ""}`}
            >
              <span className="min-w-0">
                <span className="block truncate font-medium">{i.label}</span>
                {i.sub && <span className="block truncate text-xs text-muted-foreground">{i.sub}</span>}
              </span>
              {value === i.id && <Check className="size-4 shrink-0" />}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
