"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight, MessageSquareText, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { createInquiriesFromEmails } from "@/actions/inquiries";
import { deleteEmailThreads } from "@/actions/emails";
import { fmtRelative } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface InboxThread {
  id: string;
  direction: "inbound" | "outbound";
  from_address: string;
  from_name: string | null;
  to_addresses: string[];
  subject: string | null;
  snippet: string | null;
  received_at: string;
  inquiry_id: string | null;
  count: number;
  unread: number;
  company: { id: string; name: string } | null;
  deal: { id: string; title: string } | null;
}

export function InboxList({ threads }: { threads: InboxThread[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, start] = useTransition();

  const ids = threads.map((t) => t.id);
  const allChecked = ids.length > 0 && ids.every((id) => selected.has(id));
  const someChecked = ids.some((id) => selected.has(id));
  const selectedIds = ids.filter((id) => selected.has(id));
  const registrable = threads.filter((t) => selected.has(t.id) && !t.inquiry_id).length;

  function toggle(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }
  function toggleAll(checked: boolean) {
    setSelected(checked ? new Set(ids) : new Set());
  }

  function registerInquiries() {
    start(async () => {
      try {
        const r = await createInquiriesFromEmails(selectedIds);
        if (r.created > 0) toast.success(`${r.created}件を問い合わせに登録しました${r.skipped ? `(登録済み ${r.skipped}件はスキップ)` : ""}`);
        else toast.info("選択したメールはすべて問い合わせ登録済みです");
        setSelected(new Set());
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  }

  function removeThreads() {
    start(async () => {
      try {
        const r = await deleteEmailThreads(selectedIds);
        toast.success(`${r.deleted}件のメールを削除しました`);
        setSelected(new Set());
        setConfirmDelete(false);
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  }

  return (
    <div className="rounded-lg border bg-card">
      <div className="flex items-center gap-3 border-b px-4 py-2">
        <Checkbox
          checked={allChecked ? true : someChecked ? "indeterminate" : false}
          onCheckedChange={(v) => toggleAll(v === true)}
          aria-label="すべて選択"
        />
        {selectedIds.length > 0 ? (
          <>
            <span className="text-sm text-muted-foreground">{selectedIds.length}件選択</span>
            <Button size="sm" disabled={pending} onClick={registerInquiries}>
              <MessageSquareText className="size-4" /> 問い合わせに登録
            </Button>
            {registrable < selectedIds.length && (
              <span className="text-xs text-muted-foreground">
                {registrable === 0 ? "選択したメールはすべて登録済みです" : `${selectedIds.length - registrable}件は登録済みのためスキップされます`}
              </span>
            )}
            <Button size="sm" variant="outline" disabled={pending} onClick={() => setConfirmDelete(true)} className="text-destructive">
              <Trash2 className="size-4" /> 削除
            </Button>
          </>
        ) : (
          <span className="text-sm text-muted-foreground">メールを選択して問い合わせに登録、または削除できます</span>
        )}
      </div>

      <div className="divide-y">
        {threads.map((t) => {
          const checked = selected.has(t.id);
          return (
            <div key={t.id} className={cn("flex items-start gap-3 px-4 py-3 transition-colors hover:bg-accent/50", checked && "bg-accent/40")}>
              <Checkbox className="mt-3" checked={checked} onCheckedChange={(v) => toggle(t.id, v === true)} aria-label="選択" />
              <Link href={`/inbox/${t.id}`} className="flex min-w-0 flex-1 items-start gap-3">
                <div className={cn("mt-1 flex size-8 shrink-0 items-center justify-center rounded-full", t.direction === "inbound" ? "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300")}>
                  {t.direction === "inbound" ? <ArrowDownLeft className="size-4" /> : <ArrowUpRight className="size-4" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={cn("truncate text-sm", t.unread > 0 ? "font-semibold" : "font-medium")}>
                      {t.direction === "inbound" ? t.from_name || t.from_address : `To: ${t.to_addresses.join(", ")}`}
                    </span>
                    {t.count > 1 && <span className="text-xs text-muted-foreground">({t.count})</span>}
                    {t.inquiry_id && <Badge className="hidden sm:inline-flex">問い合わせ</Badge>}
                    {t.company && <Badge variant="secondary" className="hidden sm:inline-flex">{t.company.name}</Badge>}
                    {t.deal && <Badge variant="outline" className="hidden md:inline-flex">{t.deal.title}</Badge>}
                  </div>
                  <p className={cn("truncate text-sm", t.unread > 0 ? "font-medium" : "text-foreground/90")}>{t.subject || "(件名なし)"}</p>
                  <p className="truncate text-xs text-muted-foreground">{t.snippet}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="whitespace-nowrap text-xs text-muted-foreground">{fmtRelative(t.received_at)}</span>
                  {t.unread > 0 && <span className="size-2 rounded-full bg-sky-500" />}
                </div>
              </Link>
            </div>
          );
        })}
      </div>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>メールを削除しますか?</DialogTitle>
            <DialogDescription>
              選択した {selectedIds.length} 件のスレッドをこのアプリから削除します。Gmail 側のメールは削除されません。登録済みの問い合わせ・案件は残ります。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)} disabled={pending}>キャンセル</Button>
            <Button variant="destructive" onClick={removeThreads} disabled={pending}>{pending ? "削除中..." : "削除する"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
