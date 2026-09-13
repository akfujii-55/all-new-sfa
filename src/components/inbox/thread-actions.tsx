"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MessageSquareText, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { createInquiriesFromEmails } from "@/actions/inquiries";
import { deleteEmailThreads } from "@/actions/emails";

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
        toast.error((e as Error).message);
      }
    });
  }

  function remove() {
    start(async () => {
      try {
        await deleteEmailThreads([emailId]);
        toast.success("メールを削除しました");
        router.push("/inbox");
      } catch (e) {
        toast.error((e as Error).message);
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
            <DialogTitle>このスレッドを削除しますか?</DialogTitle>
            <DialogDescription>スレッド内のメールをすべてこのアプリから削除します。メールサーバー側のメールは削除されません。登録済みの問い合わせ・案件は残ります。</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)} disabled={pending}>キャンセル</Button>
            <Button variant="destructive" onClick={remove} disabled={pending}>{pending ? "削除中..." : "削除する"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
