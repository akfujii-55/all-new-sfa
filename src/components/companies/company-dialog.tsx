"use client";

import { useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { createCompany, updateCompany } from "@/actions/companies";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Company } from "@/lib/types";

export function CompanyDialog({ trigger, company }: { trigger: ReactNode; company?: Company }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>{company ? "顧客を編集" : "顧客を登録"}</DialogTitle></DialogHeader>
        <form
          className="space-y-3"
          action={(fd) =>
            start(async () => {
              try {
                if (company) {
                  await updateCompany(company.id, fd);
                  toast.success("保存しました");
                  setOpen(false);
                } else {
                  await createCompany(fd);
                }
              } catch (e) {
                if ((e as Error & { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) return;
                toast.error((e as Error).message);
              }
            })
          }
        >
          <div className="grid gap-1.5">
            <Label htmlFor="name">会社名 *</Label>
            <Input id="name" name="name" defaultValue={company?.name} required />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="domain">メールドメイン</Label>
              <Input id="domain" name="domain" placeholder="example.co.jp" defaultValue={company?.domain ?? ""} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="industry">業種</Label>
              <Input id="industry" name="industry" defaultValue={company?.industry ?? ""} />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="phone">電話</Label>
              <Input id="phone" name="phone" defaultValue={company?.phone ?? ""} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="website">Web サイト</Label>
              <Input id="website" name="website" defaultValue={company?.website ?? ""} />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="address">住所</Label>
            <Input id="address" name="address" defaultValue={company?.address ?? ""} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="memo">メモ</Label>
            <Textarea id="memo" name="memo" rows={3} defaultValue={company?.memo ?? ""} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>キャンセル</Button>
            <Button type="submit" disabled={pending}>{company ? "保存" : "登録"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
