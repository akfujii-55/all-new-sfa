"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownLeft, ArrowUpRight, Trash2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { purgeEmailThreads, restoreEmailThreads } from "@/actions/emails";
import { actionErrorMessage } from "@/lib/errors";
import { fmtDateTime, fmtRelative } from "@/lib/format";
import { trashDaysLeft } from "@/lib/trash";
import { cn } from "@/lib/utils";

export interface TrashThread {
  id: string;
  thread_key: string;
  direction: "inbound" | "outbound";
  from_address: string;
  from_name: string | null;
  to_addresses: string[];
  subject: string | null;
  snippet: string | null;
  received_at: string;
  deleted_at: string;
  deleted_by_name: string | null;
  company: { id: string; name: string } | null;
  /** スレッド内のメール数 */
  count: number;
}

/** ゴミ箱の一覧。スレッド単位で「元に戻す」「完全に削除」 */
export function TrashList({ threads }: { threads: TrashThread[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [purgeTarget, setPurgeTarget] = useState<TrashThread | null>(null);

  function restore(t: TrashThread) {
    start(async () => {
      try {
        const r = await restoreEmailThreads([t.thread_key]);
        toast.success(`${r.restored}件のメールを元に戻しました`);
        router.refresh();
      } catch (e) {
        toast.error(actionErrorMessage(e));
      }
    });
  }

  function purge() {
    const t = purgeTarget;
    if (!t) return;
    start(async () => {
      try {
        const r = await purgeEmailThreads([t.thread_key]);
        toast.success(`${r.purged}件のメールを完全に削除しました`);
        setPurgeTarget(null);
        router.refresh();
      } catch (e) {
        toast.error(actionErrorMessage(e));
      }
    });
  }

  return (
    <div className="rounded-lg border bg-card">
      <div className="divide-y">
        {threads.map((t) => {
          const left = trashDaysLeft(t.deleted_at);
          return (
            <div key={t.id} className="flex items-start gap-3 px-4 py-3">
              <div className={cn("mt-1 flex size-8 shrink-0 items-center justify-center rounded-full", t.direction === "inbound" ? "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300")}>
                {t.direction === "inbound" ? <ArrowDownLeft className="size-4" /> : <ArrowUpRight className="size-4" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-foreground/75">
                    {t.direction === "inbound" ? t.from_name || t.from_address : `To: ${t.to_addresses.join(", ")}`}
                  </span>
                  {t.count > 1 && <span className="text-xs text-muted-foreground">({t.count})</span>}
                  {t.company && <Badge variant="secondary" className="hidden sm:inline-flex">{t.company.name}</Badge>}
                </div>
                <p className="truncate text-sm text-muted-foreground">{t.subject || "(件名なし)"}</p>
                {t.snippet && <p className="truncate text-xs text-muted-foreground/80">{t.snippet}</p>}
                <p className="mt-1 text-xs text-muted-foreground">
                  {t.deleted_by_name ? `${t.deleted_by_name} さんが` : ""}{fmtDateTime(t.deleted_at)} に削除
                  <span className="mx-1.5">·</span>
                  受信 {fmtRelative(t.received_at)}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-2">
                <Badge variant={left <= 3 ? "destructive" : "outline"}>{left === 0 ? "まもなく完全に削除" : `あと ${left} 日`}</Badge>
                <div className="flex gap-1">
                  <Button size="sm" variant="outline" disabled={pending} onClick={() => restore(t)}>
                    <Undo2 className="size-4" /> 元に戻す
                  </Button>
                  <Button size="sm" variant="ghost" disabled={pending} onClick={() => setPurgeTarget(t)} className="text-destructive">
                    <Trash2 className="size-4" /> 完全に削除
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <Dialog open={purgeTarget !== null} onOpenChange={(open) => !open && setPurgeTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>このスレッドを完全に削除しますか?</DialogTitle>
            <DialogDescription>
              「{purgeTarget?.subject || "(件名なし)"}」のメール {purgeTarget?.count ?? 0} 通と添付ファイルをこのアプリから完全に削除します。元に戻せません。メールサーバー側のメールは削除されません。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPurgeTarget(null)} disabled={pending}>キャンセル</Button>
            <Button variant="destructive" onClick={purge} disabled={pending}>{pending ? "削除中..." : "完全に削除する"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
