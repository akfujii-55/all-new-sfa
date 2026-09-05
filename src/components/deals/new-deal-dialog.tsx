"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { createDeal } from "@/actions/deals";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DEAL_STAGES, type DealStage } from "@/lib/types";

export interface NewDealDefaults {
  company_id?: string;
  contact_id?: string;
  title?: string;
  inquiry_id?: string;
  email_id?: string;
  stage?: DealStage;
}

export function NewDealDialog({
  trigger,
  companies,
  contacts,
  defaults,
}: {
  trigger: ReactNode;
  companies: { id: string; name: string }[];
  contacts: { id: string; name: string; company_id: string | null }[];
  defaults?: NewDealDefaults;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [companyId, setCompanyId] = useState(defaults?.company_id ?? "");
  const [contactId, setContactId] = useState(defaults?.contact_id ?? "");
  const [stage, setStage] = useState<DealStage>(defaults?.stage ?? "appointment");
  const [filter, setFilter] = useState("");

  const filteredCompanies = useMemo(
    () => (filter ? companies.filter((c) => c.name.toLowerCase().includes(filter.toLowerCase())) : companies),
    [companies, filter],
  );
  const companyContacts = contacts.filter((c) => !companyId || c.company_id === companyId);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>案件を作成</DialogTitle>
          <DialogDescription>アポイントを取得したら案件として管理を始めます。</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          action={(fd) =>
            start(async () => {
              try {
                fd.set("company_id", companyId);
                fd.set("contact_id", contactId);
                fd.set("stage", stage);
                if (defaults?.inquiry_id) fd.set("inquiry_id", defaults.inquiry_id);
                if (defaults?.email_id) fd.set("email_id", defaults.email_id);
                await createDeal(fd);
              } catch (e) {
                // redirect() は例外として投げられるため NEXT_REDIRECT は無視
                if ((e as Error & { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) return;
                toast.error((e as Error).message);
              }
            })
          }
        >
          <div className="grid gap-1.5">
            <Label>顧客 *</Label>
            <Select value={companyId} onValueChange={(v) => { setCompanyId(v); setContactId(""); }}>
              <SelectTrigger><SelectValue placeholder="顧客を選択" /></SelectTrigger>
              <SelectContent>
                <div className="p-2">
                  <Input placeholder="検索..." value={filter} onChange={(e) => setFilter(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
                </div>
                {filteredCompanies.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>担当者</Label>
            <Select value={contactId || "none"} onValueChange={(v) => setContactId(v === "none" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="担当者を選択" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">未選択</SelectItem>
                {companyContacts.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="title">案件名 *</Label>
            <Input id="title" name="title" defaultValue={defaults?.title ?? ""} required />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="amount">見込み売上(円)</Label>
              <Input id="amount" name="amount" inputMode="numeric" placeholder="1000000" />
            </div>
            <div className="grid gap-1.5">
              <Label>ステージ</Label>
              <Select value={stage} onValueChange={(v) => setStage(v as DealStage)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DEAL_STAGES.filter((s) => s.key !== "won" && s.key !== "lost").map((s) => (
                    <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="appointment_at">アポイント日時</Label>
              <Input id="appointment_at" name="appointment_at" type="datetime-local" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="expected_close_date">受注予定日</Label>
              <Input id="expected_close_date" name="expected_close_date" type="date" />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="memo">メモ</Label>
            <Textarea id="memo" name="memo" rows={3} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>キャンセル</Button>
            <Button type="submit" disabled={pending || !companyId}>{pending ? "作成中..." : "作成"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
