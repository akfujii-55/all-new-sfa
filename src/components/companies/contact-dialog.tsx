"use client";

import { useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { createContact, updateContact, deleteContact } from "@/actions/companies";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Contact } from "@/lib/types";

export function ContactDialog({
  trigger,
  contact,
  companies,
  defaultCompanyId,
}: {
  trigger: ReactNode;
  contact?: Contact;
  companies: { id: string; name: string }[];
  defaultCompanyId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [companyId, setCompanyId] = useState(contact?.company_id ?? defaultCompanyId ?? "");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {/* trigger はサーバーページで作られた要素が lazy 参照で届くことがあり、Slot が直接 clone できないため span で包む */}
      <DialogTrigger asChild>
        <span className="contents">{trigger}</span>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>{contact ? "担当者を編集" : "担当者を登録"}</DialogTitle></DialogHeader>
        <form
          className="space-y-3"
          action={(fd) =>
            start(async () => {
              try {
                fd.set("company_id", companyId);
                if (contact) await updateContact(contact.id, fd);
                else await createContact(fd);
                toast.success("保存しました");
                setOpen(false);
              } catch (e) {
                toast.error((e as Error).message);
              }
            })
          }
        >
          <div className="grid gap-1.5">
            <Label>会社</Label>
            <Select value={companyId || "none"} onValueChange={(v) => setCompanyId(v === "none" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="会社を選択" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">未所属</SelectItem>
                {companies.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="name">氏名 *</Label>
              <Input id="name" name="name" defaultValue={contact?.name} required />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="title">役職・部署</Label>
              <Input id="title" name="title" defaultValue={contact?.title ?? ""} />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="email">メール</Label>
              <Input id="email" name="email" type="email" defaultValue={contact?.email ?? ""} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="phone">電話</Label>
              <Input id="phone" name="phone" defaultValue={contact?.phone ?? ""} />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="memo">メモ</Label>
            <Textarea id="memo" name="memo" rows={2} defaultValue={contact?.memo ?? ""} />
          </div>
          <DialogFooter className={contact ? "sm:justify-between" : ""}>
            {contact && (
              <Button
                type="button"
                variant="ghost"
                className="text-destructive"
                onClick={() => {
                  if (!confirm("この担当者を削除しますか?")) return;
                  start(async () => {
                    try { await deleteContact(contact.id, contact.company_id); setOpen(false); } catch (e) { toast.error((e as Error).message); }
                  });
                }}
              >
                削除
              </Button>
            )}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>キャンセル</Button>
              <Button type="submit" disabled={pending}>{contact ? "保存" : "登録"}</Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
