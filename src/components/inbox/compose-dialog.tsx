"use client";

import { useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { Send } from "lucide-react";
import { sendEmail } from "@/actions/emails";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function ComposeDialog({
  trigger,
  defaults,
}: {
  trigger: ReactNode;
  defaults?: { to?: string; cc?: string; subject?: string; body?: string; dealId?: string | null; contactId?: string | null; companyId?: string | null };
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [form, setForm] = useState({
    to: defaults?.to ?? "",
    cc: defaults?.cc ?? "",
    subject: defaults?.subject ?? "",
    body: defaults?.body ?? "",
  });

  function submit() {
    start(async () => {
      try {
        await sendEmail({ ...form, dealId: defaults?.dealId, contactId: defaults?.contactId, companyId: defaults?.companyId });
        toast.success("メールを送信しました");
        setOpen(false);
        setForm({ to: defaults?.to ?? "", cc: "", subject: "", body: "" });
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {/* trigger はサーバーページで作られた要素が lazy 参照で届くことがあり、Slot が直接 clone できないため span で包む */}
      <DialogTrigger asChild>
        <span className="contents">{trigger}</span>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>メールを作成</DialogTitle>
          <DialogDescription>Gmail の SMTP 経由で送信し、履歴に保存します。</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-1.5">
            <Label>宛先</Label>
            <Input value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} placeholder="taro@example.co.jp, hanako@example.co.jp" />
          </div>
          <div className="grid gap-1.5">
            <Label>CC</Label>
            <Input value={form.cc} onChange={(e) => setForm({ ...form, cc: e.target.value })} />
          </div>
          <div className="grid gap-1.5">
            <Label>件名</Label>
            <Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
          </div>
          <div className="grid gap-1.5">
            <Label>本文</Label>
            <Textarea rows={10} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>キャンセル</Button>
          <Button onClick={submit} disabled={pending}>
            <Send className="size-4" /> {pending ? "送信中..." : "送信"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
