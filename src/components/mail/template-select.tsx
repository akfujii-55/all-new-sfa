"use client";

import { Label } from "@/components/ui/label";
import { renderMerge, unresolvedMerges, type MergeVars } from "@/lib/mail/merge";
import type { EmailTemplate } from "@/lib/types";

/** テンプレートを差し込み済みの件名・本文にする。件名が空のテンプレートは件名を変えない */
export function applyTemplate(template: EmailTemplate, vars: MergeVars): { subject: string | null; body: string; unresolved: string[] } {
  const subject = template.subject.trim() ? renderMerge(template.subject, vars) : null;
  const body = renderMerge(template.body, vars);
  return { subject, body, unresolved: unresolvedMerges(`${subject ?? ""}\n${body}`) };
}

/** 返信フォーム・新規作成ダイアログの「テンプレート」選択。テンプレートが無ければ何も表示しない */
export function TemplateSelect({
  templates,
  value,
  onChange,
  disabled,
}: {
  templates: EmailTemplate[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  if (templates.length === 0) return null;
  const common = templates.filter((t) => !t.member_id);
  const mine = templates.filter((t) => t.member_id);
  return (
    <div className="grid gap-1.5">
      <Label htmlFor="mail-template">テンプレート</Label>
      <select
        id="mail-template"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full rounded-md border bg-background px-2 text-sm"
      >
        <option value="">テンプレートを使わない</option>
        {common.length > 0 && (
          <optgroup label="会社共通">
            {common.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </optgroup>
        )}
        {mine.length > 0 && (
          <optgroup label="自分専用">
            {mine.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </optgroup>
        )}
      </select>
    </div>
  );
}
