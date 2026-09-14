"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { NotebookPen, Pencil } from "lucide-react";
import { updateInquiryMemo } from "@/actions/inquiries";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { fmtDateTime } from "@/lib/format";

import { actionErrorMessage } from "@/lib/errors";
/** 問い合わせのメモ(単一欄)。表示 → 鉛筆で編集 → 保存。案件化すると案件のメモに引き継がれる */
export function InquiryMemo({ id, memo, updatedAt, updatedBy }: { id: string; memo: string | null; updatedAt: string | null; updatedBy: string | null }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(memo ?? "");
  const [pending, start] = useTransition();

  function save() {
    start(async () => {
      try {
        await updateInquiryMemo(id, draft);
        setEditing(false);
        toast.success(draft.trim() ? "メモを保存しました" : "メモを消しました");
      } catch (e) {
        toast.error(actionErrorMessage(e));
      }
    });
  }

  if (editing) {
    return (
      <div className="mt-3 space-y-2">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
          autoFocus
          placeholder="電話した、折り返し待ち、など対応の経過を残します"
          onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") save(); }}
        />
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setDraft(memo ?? ""); }} disabled={pending}>キャンセル</Button>
          <Button size="sm" onClick={save} disabled={pending}>保存</Button>
        </div>
      </div>
    );
  }

  if (!memo) {
    return (
      <Button size="sm" variant="ghost" className="mt-2 h-7 px-2 text-xs text-muted-foreground" onClick={() => setEditing(true)}>
        <NotebookPen className="size-3.5" /> メモを追加
      </Button>
    );
  }

  return (
    <div className="mt-3 rounded-md border-l-2 border-amber-400 bg-amber-50/60 px-3 py-2 dark:bg-amber-950/20">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 whitespace-pre-wrap text-sm">{memo}</p>
        <Button size="sm" variant="ghost" className="h-6 w-6 shrink-0 p-0 text-muted-foreground" onClick={() => setEditing(true)} aria-label="メモを編集">
          <Pencil className="size-3.5" />
        </Button>
      </div>
      {updatedAt && (
        <p className="mt-1 text-[11px] text-muted-foreground">{fmtDateTime(updatedAt)}{updatedBy ? ` · ${updatedBy}` : ""}</p>
      )}
    </div>
  );
}
