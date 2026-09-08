"use client";

import { useRef, useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { Send } from "lucide-react";
import { sendEmail } from "@/actions/emails";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MailAccountSelect } from "@/components/inbox/mail-account-select";
import { useSignature } from "@/components/mail/signature-provider";
import { initialBodyWithSignature, isBodyEmpty } from "@/lib/mail/signature";
import type { MailAccountOption } from "@/lib/types";

export function ComposeDialog({
  trigger,
  defaults,
  accounts = [],
}: {
  trigger: ReactNode;
  defaults?: { to?: string; cc?: string; subject?: string; body?: string; dealId?: string | null; contactId?: string | null; companyId?: string | null; accountId?: string | null };
  /** 差出人に選べるメールアカウント。2件以上のとき選択欄を出す */
  accounts?: MailAccountOption[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [accountId, setAccountId] = useState(defaults?.accountId ?? accounts.find((a) => a.is_default)?.id ?? accounts[0]?.id ?? "");
  const signature = useSignature();
  const initialBody = defaults?.body ? `${defaults.body}\n\n${signature}` : initialBodyWithSignature(signature);
  const [form, setForm] = useState({
    to: defaults?.to ?? "",
    cc: defaults?.cc ?? "",
    subject: defaults?.subject ?? "",
    body: initialBody,
  });
  // 本文には署名が入っているので、最初のフォーカス時はカーソルを先頭(署名の上)に置く
  const caretPlaced = useRef(false);

  function submit() {
    start(async () => {
      try {
        await sendEmail({ ...form, body: form.body.trim(), dealId: defaults?.dealId, contactId: defaults?.contactId, companyId: defaults?.companyId, accountId: accountId || null });
        toast.success("メールを送信しました");
        setOpen(false);
        setForm({ to: defaults?.to ?? "", cc: "", subject: "", body: initialBody });
        caretPlaced.current = false;
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
          <DialogDescription>登録したメールアカウントから送信し、履歴に保存します。</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <MailAccountSelect accounts={accounts} value={accountId} onChange={setAccountId} />
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
            <Textarea
              rows={10}
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
              onFocus={(e) => {
                if (caretPlaced.current) return;
                caretPlaced.current = true;
                e.currentTarget.setSelectionRange(0, 0);
              }}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>キャンセル</Button>
          <Button onClick={submit} disabled={pending || isBodyEmpty(form.body, signature)}>
            <Send className="size-4" /> {pending ? "送信中..." : "送信"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
