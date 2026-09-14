"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { createTag, deleteTag, reorderTags, updateTag } from "@/actions/tags";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TagBadge } from "@/components/tags/tag-badge";
import { ReorderButtons, moveItem } from "@/components/settings/reorder-buttons";
import { MAX_TAGS, TAG_COLORS, tagColorClass } from "@/lib/tags";
import { cn } from "@/lib/utils";
import type { Tag } from "@/lib/types";

import { actionErrorMessage } from "@/lib/errors";
function ColorSelect({ name, value, onChange }: { name: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1">
      {TAG_COLORS.map((c) => (
        <button
          key={c.key}
          type="button"
          title={c.label}
          onClick={() => onChange(c.key)}
          className={cn("size-6 rounded-md border", c.className, value === c.key && "ring-2 ring-ring ring-offset-1")}
          aria-label={c.label}
        />
      ))}
      <input type="hidden" name={name} value={value} />
    </div>
  );
}

function TagRow({ tag, index, total, busy, onMove }: { tag: Tag; index: number; total: number; busy: boolean; onMove: (delta: -1 | 1) => void }) {
  const [editing, setEditing] = useState(false);
  const [color, setColor] = useState(tag.color);
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();

  if (!editing) {
    return (
      <div className="flex items-center gap-2 py-1.5">
        <ReorderButtons index={index} total={total} disabled={busy || pending} onMove={onMove} />
        <TagBadge tag={tag} className="px-2 py-1 text-xs" />
        <div className="ml-auto flex items-center gap-1">
          {confirm ? (
            <>
              <span className="text-xs text-muted-foreground">付いているメール・担当者からも外れます</span>
              <Button size="sm" variant="destructive" disabled={pending} onClick={() => start(async () => { try { await deleteTag(tag.id); toast.success("削除しました"); } catch (e) { toast.error(actionErrorMessage(e)); } })}>削除する</Button>
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
            await updateTag(tag.id, fd);
            toast.success("保存しました");
            setEditing(false);
          } catch (e) {
            toast.error(actionErrorMessage(e));
          }
        })
      }
    >
      <Input name="name" defaultValue={tag.name} className="w-40" maxLength={30} required />
      <ColorSelect name="color" value={color} onChange={setColor} />
      <div className="ml-auto flex gap-1">
        <Button size="sm" variant="ghost" type="button" onClick={() => setEditing(false)}>キャンセル</Button>
        <Button size="sm" type="submit" disabled={pending}>保存</Button>
      </div>
    </form>
  );
}

/** タグの設定。追加・名前と色の変更・削除・上下の並び替え(並び順はタグの選択肢と表示の順になる) */
export function TagSettings({ tags }: { tags: Tag[] }) {
  const [order, setOrder] = useState(tags);
  // サーバーから新しい一覧が来たら(追加・削除・保存後)並び順の state を差し替える
  const [prev, setPrev] = useState(tags);
  if (prev !== tags) {
    setPrev(tags);
    setOrder(tags);
  }
  const [color, setColor] = useState("gray");
  const [pending, start] = useTransition();
  const full = order.length >= MAX_TAGS;

  function move(index: number, delta: -1 | 1) {
    const next = moveItem(order, index, delta);
    if (next === order) return;
    setOrder(next);
    start(async () => {
      try {
        await reorderTags(next.map((t) => t.id));
      } catch (e) {
        toast.error(actionErrorMessage(e));
        setOrder(tags);
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="divide-y rounded-md border px-3">
        {order.length === 0 && <p className="py-3 text-sm text-muted-foreground">タグがありません</p>}
        {order.map((t, i) => <TagRow key={t.id} tag={t} index={i} total={order.length} busy={pending} onMove={(d) => move(i, d)} />)}
      </div>
      <form
        id="tag-create-form"
        className="flex flex-wrap items-center gap-2"
        action={(fd) =>
          start(async () => {
            try {
              await createTag(fd);
              toast.success("タグを追加しました");
              (document.getElementById("tag-create-form") as HTMLFormElement | null)?.reset();
              setColor("gray");
            } catch (e) {
              toast.error(actionErrorMessage(e));
            }
          })
        }
      >
        <Input name="name" placeholder="新しいタグ名" className="w-40" maxLength={30} required disabled={full} />
        <ColorSelect name="color" value={color} onChange={setColor} />
        <span className={cn("rounded-md px-2 py-1 text-xs", tagColorClass(color))}>プレビュー</span>
        <Button size="sm" type="submit" disabled={pending || full}><Plus className="size-4" /> 追加</Button>
      </form>
      <p className="text-xs text-muted-foreground">タグは {MAX_TAGS} 個まで(現在 {order.length} 個)。上下の矢印で並び替えると、タグを選ぶときと表示の順番になります。メール一覧や担当者一覧で選択したものにまとめて付けられ、担当者一覧ではタグで絞り込んで送信リストを作れます。</p>
    </div>
  );
}
