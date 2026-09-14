"use client";

import { useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { createCompany, deleteCompany, updateCompany } from "@/actions/companies";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Company } from "@/lib/types";

import { actionErrorMessage } from "@/lib/errors";
/** redirectOnDelete: 詳細ページから削除したときは一覧へ移動する(一覧の編集から消したときはその場で更新) */
export function CompanyDialog({ trigger, company, redirectOnDelete }: { trigger: ReactNode; company?: Company; redirectOnDelete?: boolean }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {/* trigger はサーバーページで作られた要素が lazy 参照で届くことがあり、Slot が直接 clone できないため span で包む */}
      <DialogTrigger asChild>
        <span className="contents">{trigger}</span>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>{company ? "取引先を編集" : "取引先を登録"}</DialogTitle></DialogHeader>
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
                toast.error(actionErrorMessage(e));
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
          <DialogFooter className={company ? "sm:justify-between" : ""}>
            {company && (
              <Button
                type="button"
                variant="ghost"
                className="text-destructive"
                disabled={pending}
                onClick={() => {
                  if (!confirm(`取引先「${company.name}」を削除しますか?\n担当者・メール・問い合わせは残り、取引先だけが外れます。案件がある場合は削除できません。`)) return;
                  start(async () => {
                    try {
                      await deleteCompany(company.id, redirectOnDelete ? "/companies" : undefined);
                      toast.success("取引先を削除しました");
                      setOpen(false);
                    } catch (e) {
                      if ((e as Error & { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) return;
                      toast.error(actionErrorMessage(e));
                    }
                  });
                }}
              >
                削除
              </Button>
            )}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>キャンセル</Button>
              <Button type="submit" disabled={pending}>{company ? "保存" : "登録"}</Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
