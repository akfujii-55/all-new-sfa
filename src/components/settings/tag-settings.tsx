"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { createTag, deleteTag, updateTag } from "@/actions/tags";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TagBadge } from "@/components/tags/tag-badge";
import { MAX_TAGS, TAG_COLORS, tagColorClass } from "@/lib/tags";
import { cn } from "@/lib/utils";
import type { Tag } from "@/lib/types";

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

function TagRow({ tag }: { tag: Tag }) {
  const [editing, setEditing] = useState(false);
  const [color, setColor] = useState(tag.color);
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();

  if (!editing) {
    return (
      <div className="flex items-center gap-2 py-1.5">
        <TagBadge tag={tag} className="px-2 py-1 text-xs" />
        <div className="ml-auto flex items-center gap-1">
          {confirm ? (
            <>
              <span className="text-xs text-muted-foreground">付いているメール・担当者からも外れます</span>
              <Button size="sm" variant="destructive" disabled={pending} onClick={() => start(async () => { try { await deleteTag(tag.id); toast.success("削除しました"); } catch (e) { toast.error((e as Error).message); } })}>削除する</Button>
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
            toast.error((e as Error).message);
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

export function TagSettings({ tags }: { tags: Tag[] }) {
  const [color, setColor] = useState("gray");
  const [pending, start] = useTransition();
  const full = tags.length >= MAX_TAGS;
  return (
    <div className="space-y-3">
      <div className="divide-y rounded-md border px-3">
        {tags.length === 0 && <p className="py-3 text-sm text-muted-foreground">タグがありません</p>}
        {tags.map((t) => <TagRow key={t.id} tag={t} />)}
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
              toast.error((e as Error).message);
            }
          })
        }
      >
        <Input name="name" placeholder="新しいタグ名" className="w-40" maxLength={30} required disabled={full} />
        <ColorSelect name="color" value={color} onChange={setColor} />
        <span className={cn("rounded-md px-2 py-1 text-xs", tagColorClass(color))}>プレビュー</span>
        <Button size="sm" type="submit" disabled={pending || full}><Plus className="size-4" /> 追加</Button>
      </form>
      <p className="text-xs text-muted-foreground">タグは {MAX_TAGS} 個まで(現在 {tags.length} 個)。メール一覧や担当者一覧で選択したものにまとめて付けられ、担当者一覧ではタグで絞り込んで送信リストを作れます。</p>
    </div>
  );
}
