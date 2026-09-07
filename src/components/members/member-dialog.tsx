"use client";

import { useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { createMember, updateMember, deleteMember } from "@/actions/members";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Member } from "@/lib/types";

export function MemberDialog({ trigger, member }: { trigger: ReactNode; member?: Member }) {
  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, start] = useTransition();
  const [active, setActive] = useState(member?.is_active ?? true);
  const [invite, setInvite] = useState(true);
  const [email, setEmail] = useState(member?.email ?? "");

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setConfirmDelete(false); }}>
      {/* trigger はサーバーページで作られた要素が lazy 参照で届くことがあり、Slot が直接 clone できないため span で包む */}
      <DialogTrigger asChild>
        <span className="contents">{trigger}</span>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{member ? "営業担当者を編集" : "営業担当者を登録"}</DialogTitle>
          <DialogDescription>自社の営業担当者です。案件の担当として設定できます。</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          action={(fd) =>
            start(async () => {
              try {
                fd.set("is_active", String(active));
                if (member) {
                  await updateMember(member.id, fd);
                  toast.success("保存しました");
                } else {
                  fd.set("invite", String(invite && Boolean(email.trim())));
                  const r = await createMember(fd);
                  toast.success(r.message ?? "登録しました");
                }
                setOpen(false);
              } catch (e) {
                toast.error((e as Error).message);
              }
            })
          }
        >
          <div className="grid gap-1.5">
            <Label htmlFor="name">氏名 *</Label>
            <Input id="name" name="name" defaultValue={member?.name} required />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="email">メール</Label>
            <Input id="email" name="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          {!member && (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={invite} disabled={!email.trim()} onCheckedChange={(v) => setInvite(v === true)} />
              招待メールを送る(このアプリにログインできるようにする)
            </label>
          )}
          <div className="grid gap-1.5">
            <Label htmlFor="memo">メモ</Label>
            <Textarea id="memo" name="memo" rows={2} defaultValue={member?.memo ?? ""} />
          </div>
          {member && (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={active} onCheckedChange={(v) => setActive(v === true)} />
              有効(案件の担当として選択できる)
            </label>
          )}
          <DialogFooter className={member ? "sm:justify-between" : ""}>
            {member && !confirmDelete && (
              <Button type="button" variant="ghost" className="text-destructive" onClick={() => setConfirmDelete(true)}>
                削除
              </Button>
            )}
            {member && confirmDelete && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">担当中の案件は「未設定」になります。</span>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      try {
                        await deleteMember(member.id);
                        toast.success("削除しました");
                        setOpen(false);
                      } catch (e) {
                        toast.error((e as Error).message);
                      }
                    })
                  }
                >
                  削除する
                </Button>
              </div>
            )}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>キャンセル</Button>
              <Button type="submit" disabled={pending}>{member ? "保存" : "登録"}</Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
