"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { createEmailTemplate, deleteEmailTemplate, updateEmailTemplate } from "@/actions/email-templates";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { actionErrorMessage } from "@/lib/errors";
import { EMAIL_TEMPLATE_LIMITS, MAX_EMAIL_TEMPLATES, MERGE_FIELDS } from "@/lib/mail/merge";
import type { EmailTemplate } from "@/lib/types";

/** テンプレートの追加・編集ダイアログ。差し込み項目のボタンを押すと本文のカーソル位置に入る */
function TemplateDialog({
  template,
  open,
  onOpenChange,
  canPersonal,
}: {
  template?: EmailTemplate;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** ログインユーザーが営業担当者として登録されていれば「自分専用」を選べる */
  canPersonal: boolean;
}) {
  const [pending, start] = useTransition();
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  function insertToken(key: string) {
    const ta = bodyRef.current;
    if (!ta) return;
    const token = `{{${key}}}`;
    ta.setRangeText(token, ta.selectionStart, ta.selectionEnd, "end");
    ta.focus();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <form
          className="space-y-4"
          action={(fd) =>
            start(async () => {
              try {
                if (template) await updateEmailTemplate(template.id, fd);
                else await createEmailTemplate(fd);
                toast.success(template ? "テンプレートを保存しました" : "テンプレートを追加しました");
                onOpenChange(false);
              } catch (e) {
                toast.error(actionErrorMessage(e));
              }
            })
          }
        >
          <DialogHeader>
            <DialogTitle>{template ? "テンプレートを編集" : "テンプレートを追加"}</DialogTitle>
            <DialogDescription>返信や新規作成で選ぶ文面です。署名は本文の後ろに自動で付くので、テンプレートには書かないでください。</DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="tpl-name">名前</Label>
            <Input id="tpl-name" name="name" defaultValue={template?.name ?? ""} maxLength={EMAIL_TEMPLATE_LIMITS.name} placeholder="例: 問い合わせへの一次返信" required />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="tpl-subject">件名(空なら元の件名のまま)</Label>
            <Input id="tpl-subject" name="subject" defaultValue={template?.subject ?? ""} maxLength={EMAIL_TEMPLATE_LIMITS.subject} placeholder="例: {{案件名}}のお打ち合わせについて" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="tpl-body">本文</Label>
            <Textarea id="tpl-body" name="body" ref={bodyRef} defaultValue={template?.body ?? "{{取引先}}\n{{担当者名}} 様\n\n"} rows={10} maxLength={EMAIL_TEMPLATE_LIMITS.body} required />
          </div>
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">差し込み項目(押すと本文のカーソル位置に入ります。送信時に相手や案件の情報に置き換わります)</p>
            <div className="flex flex-wrap gap-1.5">
              {MERGE_FIELDS.map((f) => (
                <button key={f.key} type="button" title={f.label} onClick={() => insertToken(f.key)} className="rounded-full border bg-muted px-2.5 py-0.5 font-mono text-xs hover:bg-accent">
                  {`{{${f.key}}}`}
                </button>
              ))}
            </div>
          </div>
          <fieldset className="flex flex-wrap items-center gap-4 text-sm">
            <legend className="sr-only">公開範囲</legend>
            <span className="text-xs text-muted-foreground">公開範囲</span>
            <label className="flex items-center gap-1.5"><input type="radio" name="scope" value="all" defaultChecked={!template?.member_id} /> 会社共通</label>
            <label className="flex items-center gap-1.5" title={canPersonal ? "" : "営業担当者として登録されているユーザーだけが使えます"}>
              <input type="radio" name="scope" value="mine" defaultChecked={Boolean(template?.member_id)} disabled={!canPersonal} /> 自分専用
            </label>
          </fieldset>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>キャンセル</Button>
            <Button type="submit" disabled={pending}>{pending ? "保存中..." : "保存"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TemplateRow({ template, canPersonal }: { template: EmailTemplate; canPersonal: boolean }) {
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-2 py-2 text-sm">
      <span className="font-medium">{template.name}</span>
      <Badge variant={template.member_id ? "default" : "outline"}>{template.member_id ? "自分専用" : "会社共通"}</Badge>
      <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{template.subject || template.body.replace(/\s+/g, " ").slice(0, 60)}</span>
      <div className="ml-auto flex items-center gap-1">
        {confirm ? (
          <>
            <Button size="sm" variant="destructive" disabled={pending} onClick={() => start(async () => { try { await deleteEmailTemplate(template.id); toast.success("テンプレートを削除しました"); } catch (e) { toast.error(actionErrorMessage(e)); } })}>削除する</Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirm(false)}>やめる</Button>
          </>
        ) : (
          <>
            <Button size="sm" variant="ghost" onClick={() => setEditing(true)} aria-label="編集"><Pencil className="size-4" /></Button>
            <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setConfirm(true)} aria-label="削除"><Trash2 className="size-4" /></Button>
          </>
        )}
      </div>
      {editing && <TemplateDialog template={template} open={editing} onOpenChange={setEditing} canPersonal={canPersonal} />}
    </div>
  );
}

/** 設定画面の「メールテンプレート」。会社共通と、ログインユーザー自身の自分専用を表示する */
export function EmailTemplateSettings({ templates, canPersonal }: { templates: EmailTemplate[]; canPersonal: boolean }) {
  const [adding, setAdding] = useState(false);
  const common = templates.filter((t) => !t.member_id).length;
  const mine = templates.filter((t) => t.member_id).length;
  return (
    <div className="space-y-3">
      <div className="divide-y rounded-md border px-3">
        {templates.length === 0 && <p className="py-3 text-sm text-muted-foreground">テンプレートがありません。例: 問い合わせへの一次返信、資料送付のご案内、打ち合わせ日程のご相談</p>}
        {templates.map((t) => <TemplateRow key={t.id} template={t} canPersonal={canPersonal} />)}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" onClick={() => setAdding(true)} disabled={common >= MAX_EMAIL_TEMPLATES && (!canPersonal || mine >= MAX_EMAIL_TEMPLATES)}><Plus className="size-4" /> 追加</Button>
        <span className="text-xs text-muted-foreground">
          会社共通 {common} / {MAX_EMAIL_TEMPLATES} 個{canPersonal ? ` · 自分専用 ${mine} / ${MAX_EMAIL_TEMPLATES} 個` : ""}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        返信フォームと新規作成ダイアログの「テンプレート」で選ぶと、件名と本文に入ります。{"{{取引先}}"} や {"{{担当者名}}"} などの差し込み項目は選んだ時点で相手の情報に置き換わり、
        分からなかった項目は {"{{…}}"} のまま残って送信前の確認画面で赤く示されます(残ったままでは送信できません)。自分専用のテンプレートは登録した本人にだけ表示されます。
      </p>
      {adding && <TemplateDialog open={adding} onOpenChange={setAdding} canPersonal={canPersonal} />}
    </div>
  );
}
