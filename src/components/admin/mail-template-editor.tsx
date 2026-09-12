"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { RotateCcw } from "lucide-react";
import { resetMailTemplate, saveMailTemplate, type MailTemplateRow } from "@/actions/admin";
import { MAIL_TEMPLATE_META, PLACEHOLDERS, renderTemplate, type MailTemplateVars } from "@/lib/mail/templates-shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { fmtDateTime } from "@/lib/format";

/** プレビュー用のサンプル値 */
const SAMPLE: MailTemplateVars = {
  name: "山田 太郎",
  company: "株式会社サンプル",
  inviter: "佐藤 花子",
  link: "https://example.com/auth/confirm?token_hash=xxxxxxxx&type=invite&next=%2Fset-password",
  expires: "24 時間",
  app_name: "SFA",
};

export function MailTemplateEditor({ template }: { template: MailTemplateRow }) {
  const meta = MAIL_TEMPLATE_META[template.key];
  const [subject, setSubject] = useState(template.subject);
  const [body, setBody] = useState(template.body);
  const [preview, setPreview] = useState(false);
  const [pending, start] = useTransition();
  const dirty = subject !== template.subject || body !== template.body;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          {meta.label}
          {template.customized ? <Badge variant="secondary">編集済み {template.updated_at ? fmtDateTime(template.updated_at) : ""}</Badge> : <Badge variant="outline">既定の文面</Badge>}
        </CardTitle>
        <CardDescription>{meta.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-3"
          action={(fd) =>
            start(async () => {
              try {
                await saveMailTemplate(template.key, fd);
                toast.success("保存しました");
              } catch (e) {
                toast.error((e as Error).message);
              }
            })
          }
        >
          <div className="grid gap-1.5">
            <Label htmlFor={`${template.key}-subject`}>件名</Label>
            <Input id={`${template.key}-subject`} name="subject" value={subject} onChange={(e) => setSubject(e.target.value)} required />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${template.key}-body`}>本文</Label>
            <Textarea id={`${template.key}-body`} name="body" rows={11} value={body} onChange={(e) => setBody(e.target.value)} className="font-mono text-xs" required />
          </div>
          <div className="flex flex-wrap gap-1 text-xs">
            <span className="text-muted-foreground">差し込み項目:</span>
            {PLACEHOLDERS.map((p) => (
              <button
                key={p.key}
                type="button"
                title={p.label}
                className="rounded border bg-muted px-1.5 py-0.5 font-mono hover:bg-accent"
                onClick={() => setBody((b) => `${b}{{${p.key}}}`)}
              >
                {`{{${p.key}}}`}
              </button>
            ))}
          </div>
          {preview && (
            <div className="rounded-md border bg-muted/40 p-3 text-sm">
              <p className="mb-2 text-xs text-muted-foreground">プレビュー(サンプル値で差し込み)</p>
              <p className="font-medium">件名: {renderTemplate(subject, SAMPLE)}</p>
              <pre className="mt-2 whitespace-pre-wrap font-sans">{renderTemplate(body, SAMPLE)}</pre>
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => setPreview((v) => !v)}>{preview ? "プレビューを閉じる" : "プレビュー"}</Button>
              {template.customized && (
                <Button
                  type="button" size="sm" variant="ghost" disabled={pending}
                  onClick={() =>
                    start(async () => {
                      try {
                        await resetMailTemplate(template.key);
                        toast.success("既定の文面に戻しました");
                      } catch (e) {
                        toast.error((e as Error).message);
                      }
                    })
                  }
                >
                  <RotateCcw className="size-4" /> 既定に戻す
                </Button>
              )}
            </div>
            <Button type="submit" size="sm" disabled={pending || !dirty}>{pending ? "保存中..." : "保存"}</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
