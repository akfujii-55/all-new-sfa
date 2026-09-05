"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Reply, Send } from "lucide-react";
import { sendEmail } from "@/actions/emails";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";

export function ReplyForm({
  replyToEmailId,
  to,
  cc,
  subject,
  quote,
}: {
  replyToEmailId: string;
  to: string;
  cc?: string;
  subject: string;
  quote?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [form, setForm] = useState({ to, cc: cc ?? "", subject: subject.startsWith("Re:") ? subject : `Re: ${subject}`, body: "" });

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} variant="outline">
        <Reply className="size-4" /> 返信する
      </Button>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-3 pt-0">
        <div className="grid gap-1.5 sm:grid-cols-2 sm:gap-3">
          <div className="grid gap-1.5">
            <Label>宛先</Label>
            <Input value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} />
          </div>
          <div className="grid gap-1.5">
            <Label>CC</Label>
            <Input value={form.cc} onChange={(e) => setForm({ ...form, cc: e.target.value })} />
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label>件名</Label>
          <Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
        </div>
        <div className="grid gap-1.5">
          <Label>本文</Label>
          <Textarea rows={8} autoFocus value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>キャンセル</Button>
          <Button
            disabled={pending || !form.body.trim()}
            onClick={() =>
              start(async () => {
                try {
                  const body = quote ? `${form.body}\n\n${quote}` : form.body;
                  await sendEmail({ ...form, body, replyToEmailId });
                  toast.success("返信を送信しました");
                  setOpen(false);
                  setForm({ ...form, body: "" });
                } catch (e) {
                  toast.error((e as Error).message);
                }
              })
            }
          >
            <Send className="size-4" /> {pending ? "送信中..." : "送信"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
