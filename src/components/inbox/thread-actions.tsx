"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MessageSquareText, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { createInquiriesFromEmails } from "@/actions/inquiries";
import { deleteEmailThreads, restoreEmailThreads } from "@/actions/emails";
import { TRASH_RETENTION_DAYS } from "@/lib/mail/trash";

import { actionErrorMessage } from "@/lib/errors";
export function ThreadActions({ emailId, hasInquiry }: { emailId: string; hasInquiry: boolean }) {
  const router = useRouter();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, start] = useTransition();

  function register() {
    start(async () => {
      try {
        const r = await createInquiriesFromEmails([emailId]);
        if (r.created > 0) toast.success("問い合わせに登録しました");
        else toast.info("このスレッドは問い合わせ登録済みです");
        router.refresh();
      } catch (e) {
        toast.error(actionErrorMessage(e));
      }
    });
  }

  function remove() {
    start(async () => {
      try {
        const r = await deleteEmailThreads([emailId]);
        toast.success(`${r.deleted}件のメールをゴミ箱に移動しました`, {
          action: {
            label: "元に戻す",
            onClick: () =>
              start(async () => {
                try {
                  await restoreEmailThreads(r.threadKeys);
                  toast.success("メールを元に戻しました");
                  router.refresh();
                } catch (e) {
                  toast.error(actionErrorMessage(e));
                }
              }),
          },
        });
        router.push("/inbox");
      } catch (e) {
        toast.error(actionErrorMessage(e));
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      {!hasInquiry && (
        <Button size="sm" disabled={pending} onClick={register}>
          <MessageSquareText className="size-4" /> 問い合わせに登録
        </Button>
      )}
      <Button size="sm" variant="outline" disabled={pending} onClick={() => setConfirmDelete(true)} className="text-destructive">
        <Trash2 className="size-4" /> 削除
      </Button>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>このスレッドをゴミ箱に移動しますか?</DialogTitle>
            <DialogDescription>スレッド内のメールをすべてゴミ箱に移動します。{TRASH_RETENTION_DAYS} 日間は「ゴミ箱」から元に戻せます。メールサーバー側のメールは削除されません。登録済みの問い合わせ・案件は残ります。</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)} disabled={pending}>キャンセル</Button>
            <Button variant="destructive" onClick={remove} disabled={pending}>{pending ? "移動中..." : "ゴミ箱に移動"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
