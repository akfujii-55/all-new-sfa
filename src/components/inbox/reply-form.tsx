"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Reply, Send } from "lucide-react";
import { sendEmail } from "@/actions/emails";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { MailAccountSelect } from "@/components/inbox/mail-account-select";
import { AttachmentPicker } from "@/components/inbox/attachment-picker";
import { checkAttachmentLimits, discardUploads, uploadAttachments } from "@/lib/mail/upload-client";
import { useReplySubject, useSignature } from "@/components/mail/signature-provider";
import { initialBodyWithSignature, isBodyEmpty } from "@/lib/mail/signature";
import type { MailAccountOption } from "@/lib/types";

export function ReplyForm({
  replyToEmailId,
  to,
  cc,
  quote,
  accounts = [],
  defaultAccountId,
}: {
  replyToEmailId: string;
  to: string;
  cc?: string;
  quote?: string;
  accounts?: MailAccountOption[];
  /** 既定の差出人(このスレッドを受信したアカウント) */
  defaultAccountId?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [accountId, setAccountId] = useState(defaultAccountId ?? accounts.find((a) => a.is_default)?.id ?? accounts[0]?.id ?? "");
  const signature = useSignature();
  // 件名は設定画面の「返信メールの件名」。送信前にフォームで変更できる
  const replySubject = useReplySubject();
  const [form, setForm] = useState({ to, cc: cc ?? "", subject: replySubject, body: initialBodyWithSignature(signature) });
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  // 本文には署名が入っているので、フォーカス時はカーソルを先頭(署名の上)に置く
  const caretPlaced = useRef(false);

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
        <MailAccountSelect accounts={accounts} value={accountId} onChange={setAccountId} />
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
          <Textarea
            rows={10}
            autoFocus
            value={form.body}
            onChange={(e) => setForm({ ...form, body: e.target.value })}
            onFocus={(e) => {
              if (caretPlaced.current) return;
              caretPlaced.current = true;
              e.currentTarget.setSelectionRange(0, 0);
            }}
          />
        </div>
        <AttachmentPicker files={files} onChange={setFiles} disabled={pending} />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>キャンセル</Button>
          <Button
            disabled={pending || isBodyEmpty(form.body, signature)}
            onClick={() => {
              const limit = checkAttachmentLimits(files);
              if (limit) {
                toast.error(limit);
                return;
              }
              start(async () => {
                let attachments: Awaited<ReturnType<typeof uploadAttachments>> = [];
                try {
                  // ファイル本体はブラウザから Storage へ直接上げ、Server Action には参照だけ渡す
                  setUploading(true);
                  attachments = await uploadAttachments(files);
                  setUploading(false);
                  const body = quote ? `${form.body.trim()}\n\n${quote}` : form.body.trim();
                  await sendEmail({ ...form, body, replyToEmailId, accountId: accountId || null, attachments });
                  toast.success("返信を送信しました");
                  setOpen(false);
                  setForm({ ...form, body: initialBodyWithSignature(signature) });
                  setFiles([]);
                  caretPlaced.current = false;
                } catch (e) {
                  setUploading(false);
                  await discardUploads(attachments);
                  toast.error((e as Error).message);
                }
              });
            }}
          >
            <Send className="size-4" /> {uploading ? "アップロード中..." : pending ? "送信中..." : "送信"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
