"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Pencil, Trash2 } from "lucide-react";
import { updateDeal, deleteDeal } from "@/actions/deals";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Deal } from "@/lib/types";
import { toLocalInput } from "@/lib/format";

export function DealEditDialog({
  deal,
  contacts,
  members = [],
}: {
  deal: Deal;
  contacts: { id: string; name: string }[];
  members?: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [contactId, setContactId] = useState(deal.contact_id ?? "");
  const [ownerId, setOwnerId] = useState(deal.owner_id ?? "");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm"><Pencil className="size-4" /> 編集</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>案件を編集</DialogTitle></DialogHeader>
        <form
          className="space-y-3"
          action={(fd) =>
            start(async () => {
              try {
                fd.set("contact_id", contactId);
                fd.set("owner_id", ownerId);
                await updateDeal(deal.id, fd);
                toast.success("保存しました");
                setOpen(false);
              } catch (e) {
                toast.error((e as Error).message);
              }
            })
          }
        >
          <div className="grid gap-1.5">
            <Label htmlFor="title">案件名</Label>
            <Input id="title" name="title" defaultValue={deal.title} required />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>担当者</Label>
              <Select value={contactId || "none"} onValueChange={(v) => setContactId(v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">未選択</SelectItem>
                  {contacts.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>営業担当者</Label>
              <Select value={ownerId || "none"} onValueChange={(v) => setOwnerId(v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">未設定</SelectItem>
                  {members.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="amount">見込み売上(円)</Label>
              <Input id="amount" name="amount" inputMode="numeric" defaultValue={deal.amount} disabled={deal.stage === "won"} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="probability">確度(%)</Label>
              <Input id="probability" name="probability" type="number" min={0} max={100} defaultValue={deal.probability} />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="appointment_at">アポイント日時</Label>
              <Input id="appointment_at" name="appointment_at" type="datetime-local" defaultValue={toLocalInput(deal.appointment_at)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="expected_close_date">受注予定日</Label>
              <Input id="expected_close_date" name="expected_close_date" type="date" defaultValue={deal.expected_close_date ?? ""} />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="memo">メモ</Label>
            <Textarea id="memo" name="memo" rows={3} defaultValue={deal.memo ?? ""} />
          </div>
          <DialogFooter className="sm:justify-between">
            <Button
              type="button"
              variant="ghost"
              className="text-destructive"
              onClick={() => {
                if (!confirm("この案件を削除しますか?メール履歴の紐付けとメモ・売上も削除されます。")) return;
                start(async () => {
                  try { await deleteDeal(deal.id); } catch (e) {
                    if (!(e as Error & { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) toast.error((e as Error).message);
                  }
                });
              }}
            >
              <Trash2 className="size-4" /> 削除
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>キャンセル</Button>
              <Button type="submit" disabled={pending}>保存</Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
