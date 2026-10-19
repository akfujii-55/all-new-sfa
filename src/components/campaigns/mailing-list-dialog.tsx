"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createMailingList, updateMailingList } from "@/actions/mailing-lists";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CAMPAIGN_LIMITS } from "@/lib/campaigns-shared";
import { actionErrorMessage } from "@/lib/errors";
import type { MailingList } from "@/lib/types";

/** 配信リストの作成・編集ダイアログ。作成後はそのリストの画面へ移る */
export function MailingListDialog({ list, trigger }: { list?: Pick<MailingList, "id" | "name" | "description">; trigger: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <>
      <span onClick={() => setOpen(true)} className="contents">{trigger}</span>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{list ? "配信リストを編集" : "配信リストを作成"}</DialogTitle>
            <DialogDescription>担当者を入れて、一斉配信の宛先にします。</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-3"
            action={(fd) =>
              start(async () => {
                try {
                  if (list) {
                    await updateMailingList(list.id, fd);
                    toast.success("保存しました");
                  } else {
                    const r = await createMailingList(fd);
                    toast.success("配信リストを作成しました");
                    router.push(`/campaigns/lists/${r.id}`);
                  }
                  setOpen(false);
                } catch (e) {
                  toast.error(actionErrorMessage(e));
                }
              })
            }
          >
            <div className="grid gap-1.5">
              <Label htmlFor="ml-name">リスト名</Label>
              <Input id="ml-name" name="name" defaultValue={list?.name ?? ""} maxLength={CAMPAIGN_LIMITS.listName} required placeholder="例: セミナー参加者 2026" autoFocus />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ml-desc">説明(任意)</Label>
              <Textarea id="ml-desc" name="description" rows={2} defaultValue={list?.description ?? ""} maxLength={CAMPAIGN_LIMITS.listDescription} placeholder="どんな相手のリストか" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>キャンセル</Button>
              <Button type="submit" disabled={pending}>{pending ? "保存中..." : list ? "保存" : "作成"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
