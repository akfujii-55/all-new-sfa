"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, Send, Trash2 } from "lucide-react";
import { deleteStepMail, saveStepMail, sendStepMailTestToMe } from "@/actions/step-mails";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { actionErrorMessage } from "@/lib/errors";
import { STEP_MAIL_PLACEHOLDERS, STEP_MAIL_SAMPLE_VARS, renderStepMail, type StepMail } from "@/lib/step-mails-shared";
import { cn } from "@/lib/utils";

type Row = StepMail & { sent_count: number };

/** ステップメールの一覧と編集(運営管理)。行を押すと下に編集フォームが開く */
export function StepMailSettings({ steps }: { steps: Row[] }) {
  // "new" は追加フォーム
  const [editing, setEditing] = useState<string | null>(null);
  const current = editing === "new" ? null : steps.find((s) => s.id === editing) ?? null;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-card">
        <div className="divide-y">
          {steps.length === 0 && <p className="px-4 py-6 text-sm text-muted-foreground">まだ回がありません。「回を追加」から作成してください。</p>}
          {steps.map((s, i) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setEditing(editing === s.id ? null : s.id)}
              className={cn("grid w-full grid-cols-[2.5rem_5rem_1fr_auto] items-center gap-3 px-4 py-3 text-left text-sm transition-colors hover:bg-muted/60", editing === s.id && "bg-accent/60")}
            >
              <span className="text-muted-foreground tabular-nums">{i + 1}</span>
              <span className="font-semibold tabular-nums">{s.day_offset} 日目</span>
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-2">
                  <span className={cn(!s.is_active && "text-muted-foreground line-through")}>{s.name}</span>
                  <Badge variant={s.send_after_paid ? "default" : "secondary"} className="text-[11px]">{s.send_after_paid ? "課金開始後も送る" : "未課金のみ"}</Badge>
                  {!s.is_active && <Badge variant="outline" className="text-[11px]">停止中</Badge>}
                </span>
                <span className="block truncate text-xs text-muted-foreground">{s.subject}</span>
              </span>
              <span className="text-right text-xs text-muted-foreground tabular-nums">送信 {s.sent_count} 件</span>
            </button>
          ))}
        </div>
        {editing && (
          <div className="border-t bg-muted/30 p-4">
            <StepMailForm key={editing} step={current} onDone={() => setEditing(null)} />
          </div>
        )}
      </div>
      {editing !== "new" && (
        <Button size="sm" onClick={() => setEditing("new")}><Plus className="size-4" /> 回を追加</Button>
      )}
    </div>
  );
}

function StepMailForm({ step, onDone }: { step: StepMail | null; onDone: () => void }) {
  const [pending, start] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [preview, setPreview] = useState(false);
  const [form, setForm] = useState({
    name: step?.name ?? "",
    day_offset: String(step?.day_offset ?? 0),
    subject: step?.subject ?? "",
    body: step?.body ?? "",
    send_after_paid: step?.send_after_paid ?? false,
    is_active: step?.is_active ?? true,
  });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  function toFormData() {
    const fd = new FormData();
    fd.set("name", form.name);
    fd.set("day_offset", form.day_offset);
    fd.set("subject", form.subject);
    fd.set("body", form.body);
    fd.set("send_after_paid", form.send_after_paid ? "on" : "off");
    fd.set("is_active", form.is_active ? "on" : "off");
    return fd;
  }

  function save() {
    start(async () => {
      try {
        await saveStepMail(step?.id ?? null, toFormData());
        toast.success("保存しました");
        onDone();
      } catch (e) {
        toast.error(actionErrorMessage(e));
      }
    });
  }
  function sendTest() {
    start(async () => {
      try {
        const r = await sendStepMailTestToMe(toFormData());
        toast.success(`${r.to} にテスト送信しました`);
      } catch (e) {
        toast.error(actionErrorMessage(e));
      }
    });
  }
  function remove() {
    if (!step) return;
    start(async () => {
      try {
        await deleteStepMail(step.id);
        toast.success("削除しました");
        onDone();
      } catch (e) {
        toast.error(actionErrorMessage(e));
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
        <div className="grid gap-1.5">
          <Label htmlFor="sm-name">名前(運営用のメモ)</Label>
          <Input id="sm-name" value={form.name} onChange={set("name")} placeholder="例: メール設定とタグ" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="sm-day">送信日(登録から何日後)</Label>
          <Input id="sm-day" type="number" min={0} max={365} value={form.day_offset} onChange={set("day_offset")} />
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="sm-subject">件名</Label>
        <Input id="sm-subject" value={form.subject} onChange={set("subject")} />
      </div>
      <div className="grid gap-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="sm-body">本文</Label>
          <button type="button" className="text-xs text-muted-foreground underline-offset-2 hover:underline" onClick={() => setPreview((v) => !v)}>
            {preview ? "編集に戻る" : "サンプルでプレビュー"}
          </button>
        </div>
        {preview ? (
          <div className="rounded-md border bg-background p-3 text-sm">
            <p className="mb-2 font-medium">{renderStepMail(form.subject, STEP_MAIL_SAMPLE_VARS)}</p>
            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">{renderStepMail(form.body, STEP_MAIL_SAMPLE_VARS)}</pre>
            <p className="mt-3 text-xs text-muted-foreground">末尾には運営の会社名と問い合わせ先が自動で付きます。</p>
          </div>
        ) : (
          <Textarea id="sm-body" rows={12} value={form.body} onChange={set("body")} className="font-mono text-xs leading-relaxed" />
        )}
        <p className="text-xs text-muted-foreground">
          差し込み: {STEP_MAIL_PLACEHOLDERS.map((p) => <code key={p.key} className="mr-2 rounded bg-muted px-1" title={p.label}>{`{{${p.key}}}`}</code>)}
        </p>
      </div>
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2">
          <Checkbox checked={form.send_after_paid} onCheckedChange={(v) => setForm((f) => ({ ...f, send_after_paid: v === true }))} />
          課金開始(カード登録)後のテナントにも送る
        </label>
        <label className="flex items-center gap-2">
          <Checkbox checked={form.is_active} onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v === true }))} />
          有効(オフにすると送らない)
        </label>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {step && !confirmDelete && (
            <Button type="button" size="sm" variant="ghost" className="text-destructive" disabled={pending} onClick={() => setConfirmDelete(true)}><Trash2 className="size-4" /> 削除</Button>
          )}
          {step && confirmDelete && (
            <>
              <span className="text-xs text-muted-foreground">送信記録も消えます</span>
              <Button type="button" size="sm" variant="destructive" disabled={pending} onClick={remove}>削除する</Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>やめる</Button>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" variant="outline" disabled={pending} onClick={sendTest} title="ログイン中の運営者のアドレスにサンプルの差し込みで送ります"><Send className="size-4" /> 自分にテスト送信</Button>
          <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={onDone}>キャンセル</Button>
          <Button type="button" size="sm" disabled={pending} onClick={save}>{pending ? "保存中..." : "保存"}</Button>
        </div>
      </div>
    </div>
  );
}
