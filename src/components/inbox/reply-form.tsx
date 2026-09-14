"use client";

import { useMemo, useRef, useState, useTransition } from "react";
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
import { useMailDefaults } from "@/components/mail/signature-provider";
import { TemplateSelect, applyTemplate } from "@/components/mail/template-select";
import { SendPreviewDialog } from "@/components/mail/send-preview-dialog";
import { initialBodyWithSignature, isBodyEmpty } from "@/lib/mail/signature";
import { selfMergeVars, type MergeVars } from "@/lib/mail/merge";
import type { MailAccountOption } from "@/lib/types";

import { actionErrorMessage } from "@/lib/errors";
export function ReplyForm({
  replyToEmailId,
  to,
  cc,
  quote,
  accounts = [],
  defaultAccountId,
  merge,
}: {
  replyToEmailId: string;
  to: string;
  cc?: string;
  quote?: string;
  accounts?: MailAccountOption[];
  /** 既定の差出人(このスレッドを受信したアカウント) */
  defaultAccountId?: string | null;
  /** テンプレートの差し込み項目に入れる、このスレッドの取引先・担当者・元メールの情報 */
  merge?: MergeVars;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [accountId, setAccountId] = useState(defaultAccountId ?? accounts.find((a) => a.is_default)?.id ?? accounts[0]?.id ?? "");
  const { signature, replySubject, memberName, companyName, templates } = useMailDefaults();
  // 件名は設定画面の「返信メールの件名」。送信前にフォームで変更できる
  const [form, setForm] = useState({ to, cc: cc ?? "", subject: replySubject, body: initialBodyWithSignature(signature) });
  const [templateId, setTemplateId] = useState("");
  const [unresolved, setUnresolved] = useState<string[]>([]);
  const [preview, setPreview] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  // 本文には署名が入っているので、フォーカス時はカーソルを先頭(署名の上)に置く
  const caretPlaced = useRef(false);

  const fromAccount = accounts.find((a) => a.id === accountId) ?? accounts[0];
  const mergeVars = useMemo<MergeVars>(
    () => ({ ...selfMergeVars({ memberName, companyName, fromEmail: fromAccount?.email ?? "" }), 担当者メール: form.to.split(/[,;\s]+/)[0] ?? "", 問い合わせ本文: quote, ...merge }),
    [memberName, companyName, fromAccount?.email, form.to, quote, merge],
  );

  function selectTemplate(id: string) {
    setTemplateId(id);
    const t = templates.find((x) => x.id === id);
    if (!t) {
      setForm((f) => ({ ...f, body: initialBodyWithSignature(signature) }));
      setUnresolved([]);
      return;
    }
    const r = applyTemplate(t, mergeVars);
    setForm((f) => ({ ...f, subject: r.subject ?? f.subject, body: `${r.body}\n\n${signature}` }));
    setUnresolved(r.unresolved);
    caretPlaced.current = true;
  }

  // 送信される本文。引用はテンプレートで {{問い合わせ本文}} として入れていなければ末尾に付ける
  const finalBody = (() => {
    const body = form.body.trim();
    if (!quote || body.includes(quote)) return body;
    return `${body}\n\n${quote}`;
  })();

  function send() {
    start(async () => {
      let attachments: Awaited<ReturnType<typeof uploadAttachments>> = [];
      try {
        // ファイル本体はブラウザから Storage へ直接上げ、Server Action には参照だけ渡す
        setUploading(true);
        attachments = await uploadAttachments(files);
        setUploading(false);
        await sendEmail({ ...form, body: finalBody, replyToEmailId, accountId: accountId || null, attachments });
        toast.success("返信を送信しました");
        setPreview(false);
        setOpen(false);
        setForm({ ...form, body: initialBodyWithSignature(signature) });
        setTemplateId("");
        setUnresolved([]);
        setFiles([]);
        caretPlaced.current = false;
      } catch (e) {
        setUploading(false);
        await discardUploads(attachments);
        toast.error(actionErrorMessage(e));
      }
    });
  }

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
        <TemplateSelect templates={templates} value={templateId} onChange={selectTemplate} disabled={pending} />
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
          {unresolved.length > 0 && (
            <p className="text-xs text-amber-700 dark:text-amber-400">この画面では分からない差し込み項目があります: {unresolved.join(" ")}。手で直してから送ってください。</p>
          )}
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
              setPreview(true);
            }}
          >
            <Send className="size-4" /> 確認して送信
          </Button>
        </div>
        <SendPreviewDialog
          open={preview}
          onOpenChange={setPreview}
          from={fromAccount ? `${fromAccount.label}${fromAccount.label !== fromAccount.email ? ` <${fromAccount.email}>` : ""}` : "既定のメールアカウント"}
          to={form.to}
          cc={form.cc}
          subject={form.subject}
          body={finalBody}
          files={files}
          pending={pending}
          sendLabel={uploading ? "アップロード中..." : pending ? "送信中..." : "送信"}
          onSend={send}
        />
      </CardContent>
    </Card>
  );
}
