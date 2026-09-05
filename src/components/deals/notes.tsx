"use client";

import { useRef, useTransition } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { addDealNote, deleteDealNote } from "@/actions/deals";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { fmtDateTime, initials } from "@/lib/format";
import type { DealNote } from "@/lib/types";

export function DealNotes({ dealId, notes }: { dealId: string; notes: DealNote[] }) {
  const [pending, start] = useTransition();
  const ref = useRef<HTMLFormElement>(null);
  return (
    <div className="space-y-4">
      <form
        ref={ref}
        className="space-y-2"
        action={(fd) =>
          start(async () => {
            try {
              await addDealNote(dealId, fd);
              ref.current?.reset();
            } catch (e) {
              toast.error((e as Error).message);
            }
          })
        }
      >
        <Textarea name="body" rows={3} placeholder="商談メモを入力(例: 決裁者は部長。来月予算確定。競合はA社)" required />
        <div className="flex justify-end">
          <Button type="submit" size="sm" disabled={pending}>メモを追加</Button>
        </div>
      </form>
      <div className="space-y-3">
        {notes.length === 0 && <p className="text-sm text-muted-foreground">まだメモはありません</p>}
        {notes.map((n) => (
          <div key={n.id} className="flex gap-3 group">
            <Avatar className="size-8"><AvatarFallback className="text-xs">{initials(n.author?.full_name)}</AvatarFallback></Avatar>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{n.author?.full_name ?? "-"}</span>
                <span>{fmtDateTime(n.created_at)}</span>
                <button
                  className="ml-auto opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                  onClick={() => start(() => deleteDealNote(n.id, dealId))}
                  aria-label="削除"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm">{n.body}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
