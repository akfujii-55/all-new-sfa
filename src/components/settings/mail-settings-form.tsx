"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { saveMailSettings } from "@/actions/settings";
import { buildSignature } from "@/lib/mail/signature";
import type { MailSettings } from "@/lib/settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import { actionErrorMessage } from "@/lib/errors";
export function MailSettingsForm({ settings, memberName }: { settings: MailSettings; memberName: string }) {
  const [form, setForm] = useState(settings);
  const [pending, start] = useTransition();
  const set = (key: keyof MailSettings) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm({ ...form, [key]: e.target.value });

  return (
    <form
      className="space-y-4"
      action={(fd) =>
        start(async () => {
          try {
            await saveMailSettings(fd);
            toast.success("保存しました");
          } catch (e) {
            toast.error(actionErrorMessage(e));
          }
        })
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="signature_company">会社名</Label>
          <Input id="signature_company" name="signature_company" value={form.signature_company} onChange={set("signature_company")} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="signature_email">メールアドレス(任意)</Label>
          <Input id="signature_email" name="signature_email" type="email" value={form.signature_email} onChange={set("signature_email")} placeholder="空欄なら送信元アカウントのアドレス" />
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="signature_extra">追加行(任意)</Label>
        <Textarea id="signature_extra" name="signature_extra" rows={3} value={form.signature_extra} onChange={set("signature_extra")} placeholder={"TEL: 03-0000-0000\nhttps://example.co.jp"} />
        <p className="text-xs text-muted-foreground">電話番号や住所、URL など。1 行ずつ署名の末尾に追加されます。メールアカウントごとに違う署名を使いたいときは、メールアカウントの編集画面の「このアカウント専用の署名」に入力してください。</p>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="reply_subject">返信メールの件名</Label>
        <Input id="reply_subject" name="reply_subject" value={form.reply_subject} onChange={set("reply_subject")} />
        <p className="text-xs text-muted-foreground">受信トレイから返信するときの件名の初期値。送信前に変更できます。</p>
      </div>
      <div className="grid gap-1.5">
        <Label>署名のプレビュー(担当者名はログイン中の営業担当者の名前。メールアドレスは送信時に送信元アカウントのものになります)</Label>
        <pre className="whitespace-pre-wrap rounded-md border bg-muted/40 p-3 text-xs">{buildSignature(form, memberName)}</pre>
      </div>
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>{pending ? "保存中..." : "保存"}</Button>
      </div>
    </form>
  );
}
