"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteInquiry } from "@/actions/inquiries";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function DeleteInquiryButton({ id, subject, hasDeal }: { id: string; subject: string; hasDeal: boolean }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  function remove() {
    start(async () => {
      try {
        await deleteInquiry(id);
        toast.success("問い合わせを削除しました");
        setOpen(false);
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  }

  return (
    <>
      <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-destructive" onClick={() => setOpen(true)} aria-label="問い合わせを削除">
        <Trash2 className="size-4" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>問い合わせを削除しますか?</DialogTitle>
            <DialogDescription>
              「{subject}」を問い合わせ一覧から削除します。元のメールは残り、メール画面では「問い合わせ未登録」に戻ります。
              {hasDeal && " 紐付いている案件は削除されず、問い合わせとの紐付けだけが外れます。"}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>キャンセル</Button>
            <Button variant="destructive" onClick={remove} disabled={pending}>{pending ? "削除中..." : "削除する"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
