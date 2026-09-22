"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownLeft, ArrowUpRight, Trash2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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

/** 完全削除の対象: 1 スレッド / チェックしたもの / ゴミ箱全部 */
type PurgeTarget = { kind: "one"; thread: TrashThread } | { kind: "selected"; threads: TrashThread[] } | { kind: "all" };

/** ゴミ箱の一覧。スレッド単位・チェック選択・全部の「元に戻す」「完全に削除」 */
export function TrashList({ threads }: { threads: TrashThread[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [purgeTarget, setPurgeTarget] = useState<PurgeTarget | null>(null);

  const keys = threads.map((t) => t.thread_key);
  const allChecked = keys.length > 0 && keys.every((k) => selected.has(k));
  const someChecked = keys.some((k) => selected.has(k));
  const selectedThreads = threads.filter((t) => selected.has(t.thread_key));

  function toggle(key: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  }
  function toggleAll(checked: boolean) {
    setSelected(checked ? new Set(keys) : new Set());
  }

  function restore(threadKeys: string[]) {
    start(async () => {
      try {
        const r = await restoreEmailThreads(threadKeys);
        toast.success(`${r.restored}件のメールを元に戻しました`);
        setSelected(new Set());
        router.refresh();
      } catch (e) {
        toast.error(actionErrorMessage(e));
      }
    });
  }

  function purge() {
    const target = purgeTarget;
    if (!target) return;
    start(async () => {
      try {
        const r = await purgeEmailThreads(
          target.kind === "all" ? null : target.kind === "one" ? [target.thread.thread_key] : target.threads.map((t) => t.thread_key),
        );
        toast.success(`${r.purged}件のメールを完全に削除しました`);
        setPurgeTarget(null);
        setSelected(new Set());
        router.refresh();
      } catch (e) {
        toast.error(actionErrorMessage(e));
      }
    });
  }

  const purgeCount = purgeTarget
    ? purgeTarget.kind === "all"
      ? { threads: threads.length, mails: threads.reduce((a, t) => a + t.count, 0) }
      : purgeTarget.kind === "one"
        ? { threads: 1, mails: purgeTarget.thread.count }
        : { threads: purgeTarget.threads.length, mails: purgeTarget.threads.reduce((a, t) => a + t.count, 0) }
    : null;

  return (
    <div className="rounded-lg border bg-card">
      <div className="flex flex-wrap items-center gap-3 border-b px-4 py-2">
        <Checkbox
          checked={allChecked ? true : someChecked ? "indeterminate" : false}
          onCheckedChange={(v) => toggleAll(v === true)}
          aria-label="すべて選択"
        />
        {selectedThreads.length > 0 ? (
          <>
            <span className="text-sm text-muted-foreground">{selectedThreads.length}件選択</span>
            <Button size="sm" variant="outline" disabled={pending} onClick={() => restore(selectedThreads.map((t) => t.thread_key))}>
              <Undo2 className="size-4" /> 元に戻す
            </Button>
            <Button size="sm" variant="outline" disabled={pending} onClick={() => setPurgeTarget({ kind: "selected", threads: selectedThreads })} className="text-destructive">
              <Trash2 className="size-4" /> 完全に削除
            </Button>
          </>
        ) : (
          <span className="text-sm text-muted-foreground">{threads.length} スレッド。チェックを付けてまとめて元に戻す・完全に削除ができます</span>
        )}
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => setPurgeTarget({ kind: "all" })} className="ml-auto text-destructive">
          <Trash2 className="size-4" /> ゴミ箱を空にする
        </Button>
      </div>

      <div className="divide-y">
        {threads.map((t) => {
          const left = trashDaysLeft(t.deleted_at);
          const checked = selected.has(t.thread_key);
          return (
            <div key={t.id} className={cn("flex items-start gap-3 px-4 py-3", checked && "bg-accent/60 dark:bg-accent/40")}>
              <Checkbox className="mt-3" checked={checked} onCheckedChange={(v) => toggle(t.thread_key, v === true)} aria-label="選択" />
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
                  <Button size="sm" variant="outline" disabled={pending} onClick={() => restore([t.thread_key])}>
                    <Undo2 className="size-4" /> 元に戻す
                  </Button>
                  <Button size="sm" variant="ghost" disabled={pending} onClick={() => setPurgeTarget({ kind: "one", thread: t })} className="text-destructive">
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
            <DialogTitle>{purgeTarget?.kind === "all" ? "ゴミ箱を空にしますか?" : purgeTarget?.kind === "selected" ? "選択したスレッドを完全に削除しますか?" : "このスレッドを完全に削除しますか?"}</DialogTitle>
            <DialogDescription>
              {purgeTarget?.kind === "one" ? `「${purgeTarget.thread.subject || "(件名なし)"}」の` : `${purgeCount?.threads ?? 0} スレッドの`}
              メール {purgeCount?.mails ?? 0} 通と添付ファイルをこのアプリから完全に削除します。元に戻せません。メールサーバー側のメールは削除されません。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPurgeTarget(null)} disabled={pending}>キャンセル</Button>
            <Button variant="destructive" onClick={purge} disabled={pending}>{pending ? "削除中..." : purgeTarget?.kind === "all" ? "空にする" : "完全に削除する"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
