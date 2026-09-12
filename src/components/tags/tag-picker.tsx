"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { Tag as TagIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TagBadge } from "@/components/tags/tag-badge";
import type { Tag } from "@/lib/types";

/**
 * タグの付け外しを選ぶポップオーバー。
 * current: 選択中の対象に付いているタグ(全部に付いていれば checked、一部なら indeterminate)。
 * 「適用」で add / remove を呼び出し側に渡す。
 */
export function TagPicker({
  tags,
  current,
  onApply,
  pending,
  trigger,
  description,
}: {
  tags: Tag[];
  /** tag_id → 付いている対象の数 */
  current: Map<string, number>;
  /** 選択中の対象の数 */
  onApply: (change: { add: string[]; remove: string[] }) => void;
  pending?: boolean;
  trigger?: ReactNode;
  description?: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<Record<string, "on" | "off">>({});
  const total = Math.max(...Array.from(current.values()), 0);

  function initial(tagId: string): "on" | "off" {
    return (current.get(tagId) ?? 0) > 0 ? "on" : "off";
  }
  function stateOf(tagId: string) {
    return state[tagId] ?? initial(tagId);
  }
  function toggle(tagId: string) {
    setState((prev) => ({ ...prev, [tagId]: stateOf(tagId) === "on" ? "off" : "on" }));
  }
  function apply() {
    const add: string[] = [];
    const remove: string[] = [];
    for (const t of tags) {
      const s = state[t.id];
      if (!s) continue;
      // 「一部にだけ付いている」タグにチェックを入れた場合も、選択した対象すべてに付ける
      if (s === "on") add.push(t.id);
      if (s === "off") remove.push(t.id);
    }
    onApply({ add, remove });
    setState({});
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setState({}); }}>
      <PopoverTrigger asChild>
        {trigger ?? (
          <Button size="sm" variant="outline" disabled={pending}>
            <TagIcon className="size-4" /> タグ
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64">
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
        {tags.length === 0 ? (
          <p className="text-sm text-muted-foreground">タグがありません。<Link href="/settings" className="underline">設定</Link>で追加してください。</p>
        ) : (
          <div className="max-h-72 space-y-1 overflow-y-auto">
            {tags.map((t) => {
              const st = stateOf(t.id);
              const n = current.get(t.id) ?? 0;
              return (
                <label key={t.id} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 hover:bg-accent">
                  <Checkbox checked={st === "on"} onCheckedChange={() => toggle(t.id)} />
                  <TagBadge tag={t} />
                  {n > 0 && n < total && !state[t.id] && <span className="ml-auto text-[10px] text-muted-foreground">一部</span>}
                </label>
              );
            })}
          </div>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>キャンセル</Button>
          <Button size="sm" onClick={apply} disabled={pending || Object.keys(state).length === 0}>適用</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
