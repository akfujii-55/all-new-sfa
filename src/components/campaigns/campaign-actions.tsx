"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pause, Play, Ban, Trash2, Copy, RefreshCw } from "lucide-react";
import { cancelCampaign, deleteCampaign, duplicateCampaign, pauseCampaign, resumeCampaign } from "@/actions/campaigns";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { actionErrorMessage } from "@/lib/errors";
import type { MailCampaignStatus } from "@/lib/types";

/** 配信の詳細の操作: 一時停止・再開・取り消し・複製・削除・最新の状態に更新 */
export function CampaignActions({ id, status }: { id: string; status: MailCampaignStatus }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState<"cancel" | "delete" | null>(null);
  const run = (fn: () => Promise<unknown>, ok: string, then?: () => void) =>
    start(async () => {
      try {
        await fn();
        toast.success(ok);
        setConfirm(null);
        then?.();
        router.refresh();
      } catch (e) {
        toast.error(actionErrorMessage(e));
      }
    });
  return (
    <div className="flex flex-wrap items-center gap-2">
      {(status === "sending" || status === "scheduled") && <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => pauseCampaign(id), "一時停止しました")}><Pause className="size-4" /> 一時停止</Button>}
      {status === "paused" && <Button size="sm" disabled={pending} onClick={() => run(() => resumeCampaign(id), "再開しました")}><Play className="size-4" /> 再開</Button>}
      {(status === "sending" || status === "scheduled" || status === "paused") && <Button size="sm" variant="outline" className="text-destructive" disabled={pending} onClick={() => setConfirm("cancel")}><Ban className="size-4" /> 取り消し</Button>}
      {status === "sending" && <Button size="sm" variant="ghost" disabled={pending} onClick={() => router.refresh()}><RefreshCw className="size-4" /> 更新</Button>}
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(async () => { const r = await duplicateCampaign(id); router.push(`/campaigns/${r.id}`); }, "同じ内容で下書きを作りました")}><Copy className="size-4" /> 複製</Button>
      {(status === "draft" || status === "done" || status === "cancelled" || status === "paused") && (
        <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-destructive" disabled={pending} onClick={() => setConfirm("delete")}><Trash2 className="size-4" /> 削除</Button>
      )}
      <Dialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{confirm === "cancel" ? "配信を取り消しますか?" : "配信を削除しますか?"}</DialogTitle>
            <DialogDescription>{confirm === "cancel" ? "まだ送っていない宛先には送りません。送った分の記録は残ります。" : "この配信と宛先ごとの結果を削除します。送ったメールは取り消せません。"}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirm(null)}>キャンセル</Button>
            {confirm === "cancel" ? (
              <Button type="button" variant="destructive" disabled={pending} onClick={() => run(() => cancelCampaign(id), "取り消しました")}>取り消す</Button>
            ) : (
              <Button type="button" variant="destructive" disabled={pending} onClick={() => run(() => deleteCampaign(id), "削除しました", () => router.push("/campaigns"))}>削除する</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
