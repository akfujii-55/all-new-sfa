"use client";

import { useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { Send } from "lucide-react";
import { sendEmail } from "@/actions/emails";
import { lookupContactByEmail } from "@/actions/email-templates";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
export function ComposeDialog({
  trigger,
  defaults,
  accounts = [],
  merge,
}: {
  trigger: ReactNode;
  defaults?: { to?: string; cc?: string; subject?: string; body?: string; dealId?: string | null; contactId?: string | null; companyId?: string | null; accountId?: string | null };
  /** 差出人に選べるメールアカウント。2件以上のとき選択欄を出す */
  accounts?: MailAccountOption[];
  /** テンプレートの差し込み項目に入れる、開いた画面の取引先・担当者・案件の情報。無ければ宛先から登録済みの担当者を探す */
  merge?: MergeVars;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [accountId, setAccountId] = useState(defaults?.accountId ?? accounts.find((a) => a.is_default)?.id ?? accounts[0]?.id ?? "");
  const { signature, memberName, companyName, templates } = useMailDefaults();
  const initialBody = defaults?.body ? `${defaults.body}\n\n${signature}` : initialBodyWithSignature(signature);
  const [form, setForm] = useState({
    to: defaults?.to ?? "",
    cc: defaults?.cc ?? "",
    subject: defaults?.subject ?? "",
    body: initialBody,
  });
  const [templateId, setTemplateId] = useState("");
  const [unresolved, setUnresolved] = useState<string[]>([]);
  const [preview, setPreview] = useState(false);
  // 宛先から探した登録済みの担当者(取引先・担当者名が渡されていない画面で使う)
  const [looked, setLooked] = useState<{ email: string; vars: MergeVars }>({ email: "", vars: {} });
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  // 本文には署名が入っているので、最初のフォーカス時はカーソルを先頭(署名の上)に置く
  const caretPlaced = useRef(false);

  const fromAccount = accounts.find((a) => a.id === accountId) ?? accounts[0];
  const firstTo = form.to.split(/[,;\s]+/)[0] ?? "";
  const mergeVars = useMemo<MergeVars>(
    () => ({
      ...selfMergeVars({ memberName, companyName, fromEmail: fromAccount?.email ?? "" }),
      担当者メール: firstTo,
      ...(looked.email === firstTo.toLowerCase() ? looked.vars : {}),
      ...merge,
    }),
    [memberName, companyName, fromAccount?.email, firstTo, looked, merge],
  );

  // 取引先・担当者名が渡されていない画面(受信トレイの新規作成)では、宛先を入れた時点で登録済みの担当者を探す
  async function lookupTo() {
    if (merge?.担当者名 || !firstTo.includes("@") || looked.email === firstTo.toLowerCase()) return;
    try {
      const found = await lookupContactByEmail(firstTo);
      setLooked({ email: firstTo.toLowerCase(), vars: found ? { 担当者名: found.contactName, 取引先: found.companyName ?? "" } : {} });
    } catch {
      // 見つからなくても送信はできるので、失敗は無視する
    }
  }

  function selectTemplate(id: string) {
    setTemplateId(id);
    const t = templates.find((x) => x.id === id);
    if (!t) {
      setForm((f) => ({ ...f, body: initialBody }));
      setUnresolved([]);
      return;
    }
    const r = applyTemplate(t, mergeVars);
    setForm((f) => ({ ...f, subject: r.subject ?? f.subject, body: `${r.body}\n\n${signature}` }));
    setUnresolved(r.unresolved);
    caretPlaced.current = true;
  }

  function reset() {
    setForm({ to: defaults?.to ?? "", cc: "", subject: defaults?.subject ?? "", body: initialBody });
    setTemplateId("");
    setUnresolved([]);
    setFiles([]);
    caretPlaced.current = false;
  }

  function send() {
    start(async () => {
      let attachments: Awaited<ReturnType<typeof uploadAttachments>> = [];
      try {
        // ファイル本体はブラウザから Storage へ直接上げ、Server Action には参照だけ渡す
        setUploading(true);
        attachments = await uploadAttachments(files);
        setUploading(false);
        await sendEmail({ ...form, body: form.body.trim(), dealId: defaults?.dealId, contactId: defaults?.contactId, companyId: defaults?.companyId, accountId: accountId || null, attachments });
        toast.success("メールを送信しました");
        setPreview(false);
        setOpen(false);
        reset();
      } catch (e) {
        setUploading(false);
        await discardUploads(attachments);
        toast.error(actionErrorMessage(e));
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {/* trigger はサーバーページで作られた要素が lazy 参照で届くことがあり、Slot が直接 clone できないため span で包む */}
      <DialogTrigger asChild>
        <span className="contents">{trigger}</span>
      </DialogTrigger>
      {/* 画面が低いときは本文側だけをスクロールさせ、送信ボタンは常に見えるようにする */}
      <DialogContent className="flex flex-col sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>メールを作成</DialogTitle>
          <DialogDescription>登録したメールアカウントから送信し、履歴に保存します。</DialogDescription>
        </DialogHeader>
        <div className="-mx-1 min-h-0 flex-1 space-y-3 overflow-y-auto px-1">
          <MailAccountSelect accounts={accounts} value={accountId} onChange={setAccountId} />
          <TemplateSelect templates={templates} value={templateId} onChange={selectTemplate} disabled={pending} />
          <div className="grid gap-1.5">
            <Label>宛先</Label>
            <Input value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} onBlur={lookupTo} placeholder="taro@example.co.jp, hanako@example.co.jp" />
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
            {/* Textarea は内容に合わせて伸びる(field-sizing)ので、長いテンプレート・引用でダイアログが画面からはみ出さないよう高さを抑える */}
            <Textarea
              rows={10}
              className="max-h-[45dvh]"
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
              onFocus={(e) => {
                if (caretPlaced.current) return;
                caretPlaced.current = true;
                e.currentTarget.setSelectionRange(0, 0);
              }}
            />
            {unresolved.length > 0 && (
              <p className="text-xs text-amber-700 dark:text-amber-400">
                この画面では分からない差し込み項目があります: {unresolved.join(" ")}。手で直すか、宛先を入力してからテンプレートを選び直してください。
              </p>
            )}
          </div>
          <AttachmentPicker files={files} onChange={setFiles} disabled={pending} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>キャンセル</Button>
          <Button
            onClick={() => {
              const limit = checkAttachmentLimits(files);
              if (limit) {
                toast.error(limit);
                return;
              }
              setPreview(true);
            }}
            disabled={pending || isBodyEmpty(form.body, signature)}
          >
            <Send className="size-4" /> 確認して送信
          </Button>
        </DialogFooter>
        <SendPreviewDialog
          open={preview}
          onOpenChange={setPreview}
          from={fromAccount ? `${fromAccount.label}${fromAccount.label !== fromAccount.email ? ` <${fromAccount.email}>` : ""}` : "既定のメールアカウント"}
          to={form.to}
          cc={form.cc}
          subject={form.subject}
          body={form.body.trim()}
          files={files}
          pending={pending}
          sendLabel={uploading ? "アップロード中..." : pending ? "送信中..." : "送信"}
          onSend={send}
        />
      </DialogContent>
    </Dialog>
  );
}
