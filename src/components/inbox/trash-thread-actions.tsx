"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { purgeEmailThreads, restoreEmailThreads } from "@/actions/emails";
import { actionErrorMessage } from "@/lib/errors";

interface Props {
  threadKey: string;
  /** 元に戻した後に開くスレッドのメール id */
  emailId: string;
  count: number;
  subject: string | null;
}

/** ゴミ箱のスレッド画面の「元に戻す」「完全に削除」。戻したら通常のスレッド画面へ、消したらゴミ箱一覧へ移動する */
export function TrashThreadActions({ threadKey, emailId, count, subject }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);

  function restore() {
    start(async () => {
      try {
        const r = await restoreEmailThreads([threadKey]);
        toast.success(`${r.restored}件のメールを元に戻しました`);
        router.replace(`/inbox/${emailId}`);
      } catch (e) {
        toast.error(actionErrorMessage(e));
      }
    });
  }

  function purge() {
    start(async () => {
      try {
        const r = await purgeEmailThreads([threadKey]);
        toast.success(`${r.purged}件のメールを完全に削除しました`);
        setConfirmOpen(false);
        router.replace("/inbox/trash");
      } catch (e) {
        toast.error(actionErrorMessage(e));
      }
    });
  }

  return (
    <div className="flex gap-1">
      <Button size="sm" variant="outline" disabled={pending} onClick={restore}>
        <Undo2 className="size-4" /> 元に戻す
      </Button>
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => setConfirmOpen(true)} className="text-destructive">
        <Trash2 className="size-4" /> 完全に削除
      </Button>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>このスレッドを完全に削除しますか?</DialogTitle>
            <DialogDescription>
              「{subject || "(件名なし)"}」のメール {count} 通と添付ファイルをこのアプリから完全に削除します。元に戻せません。メールサーバー側のメールは削除されません。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={pending}>キャンセル</Button>
            <Button variant="destructive" onClick={purge} disabled={pending}>{pending ? "削除中..." : "完全に削除する"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
