"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { saveFormSettings } from "@/actions/settings";
import { DEFAULT_FORM_LABELS, type FormLabels } from "@/lib/mail/extract";
import type { FormSettings } from "@/lib/settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const FIELDS: { key: keyof FormSettings; label: string; labels: keyof FormLabels }[] = [
  { key: "form_labels_company", label: "会社名の項目名", labels: "company" },
  { key: "form_labels_name", label: "氏名の項目名", labels: "name" },
  { key: "form_labels_email", label: "メールアドレスの項目名", labels: "email" },
  { key: "form_labels_phone", label: "電話番号の項目名", labels: "phone" },
  { key: "form_labels_message", label: "問い合わせ内容の項目名", labels: "message" },
];

/** 問い合わせフォームの通知メールを読み取るための設定(送信元アドレスとフォーム固有の項目名) */
export function FormSettingsForm({ settings }: { settings: FormSettings }) {
  const [form, setForm] = useState<FormSettings>({ ...settings });
  const [pending, start] = useTransition();
  const set = (key: keyof FormSettings) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: e.target.value });
  const toLine = (v: string) => v.replace(/\n/g, ", ");

  return (
    <form
      className="space-y-4"
      action={(fd) =>
        start(async () => {
          try {
            await saveFormSettings(fd);
            toast.success("保存しました");
          } catch (e) {
            toast.error((e as Error).message);
          }
        })
      }
    >
      <div className="grid gap-1.5">
        <Label htmlFor="form_senders">通知メールの送信元アドレス</Label>
        <Input id="form_senders" name="form_senders" value={toLine(form.form_senders)} onChange={set("form_senders")} placeholder="noreply@example-form.jp, form@yourcompany.jp" />
        <p className="text-xs text-muted-foreground">
          フォームツールが通知メールを送ってくる差出人アドレス(カンマ区切りで複数可)。ここからのメールは、差出人ではなく本文に書かれた問い合わせ者を担当者として登録します。本文を読み取れなかった場合は担当者を自動登録せず、スレッド画面で手で紐付けます。
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {FIELDS.map((f) => (
          <div key={f.key} className="grid gap-1.5">
            <Label htmlFor={f.key}>{f.label}</Label>
            <Input id={f.key} name={f.key} value={toLine(form[f.key])} onChange={set(f.key)} placeholder={`例: ${DEFAULT_FORM_LABELS[f.labels].slice(0, 2).join(", ")}`} />
            <p className="text-xs text-muted-foreground truncate" title={DEFAULT_FORM_LABELS[f.labels].join(", ")}>
              標準で認識: {DEFAULT_FORM_LABELS[f.labels].join(", ")}
            </p>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        自社フォームの通知メールで使っている項目名が標準の一覧に無い場合だけ追加してください(カンマ区切りで複数可)。通知メールの「項目名: 値」の行にある項目名と同じ表記にします。
      </p>
      <Button type="submit" size="sm" disabled={pending}>{pending ? "保存中..." : "保存"}</Button>
    </form>
  );
}
