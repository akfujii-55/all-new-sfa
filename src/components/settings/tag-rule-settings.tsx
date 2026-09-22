"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { History, Pencil, Plus, Trash2 } from "lucide-react";
import { applyTagRuleToExisting, createTagRule, deleteTagRule, updateTagRule } from "@/actions/tag-rules";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TagBadge } from "@/components/tags/tag-badge";
import { actionErrorMessage } from "@/lib/errors";
import { MAX_TAG_RULES, TAG_RULE_FIELDS } from "@/lib/tag-rules";
import type { EmailTagRule, Tag } from "@/lib/types";

const selectClass = "h-8 rounded-md border bg-background px-2 text-sm";

function fieldLabel(key: string) {
  return TAG_RULE_FIELDS.find((f) => f.key === key)?.label ?? key;
}

function RuleFields({ rule, tags }: { rule?: EmailTagRule; tags: Tag[] }) {
  const [field, setField] = useState<EmailTagRule["field"]>(rule?.field ?? "subject");
  const placeholder = TAG_RULE_FIELDS.find((f) => f.key === field)?.placeholder;
  return (
    <>
      <select name="field" value={field} onChange={(e) => setField(e.target.value as EmailTagRule["field"])} className={selectClass} aria-label="判定する場所">
        {TAG_RULE_FIELDS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
      </select>
      <span className="text-sm text-muted-foreground">に</span>
      <Input name="keywords" defaultValue={rule?.keywords ?? ""} placeholder={placeholder} className="h-8 w-64 max-w-full" maxLength={500} required />
      <span className="text-sm text-muted-foreground">を含む →</span>
      <select name="tag_id" defaultValue={rule?.tag_id ?? ""} className={selectClass} aria-label="付けるタグ" required>
        <option value="">タグを選ぶ</option>
        {tags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>
    </>
  );
}

function RuleRow({ rule, tags }: { rule: EmailTagRule; tags: Tag[] }) {
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();
  const tag = rule.tag ?? tags.find((t) => t.id === rule.tag_id) ?? null;

  if (!editing) {
    return (
      <div className="flex flex-wrap items-center gap-2 py-1.5 text-sm">
        <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">{fieldLabel(rule.field)}</span>
        <span>に「{rule.keywords}」を含む</span>
        <span className="text-muted-foreground">→</span>
        {tag ? <TagBadge tag={tag} className="px-2 py-0.5 text-xs" /> : <span className="text-destructive text-xs">タグが削除されています</span>}
        <div className="ml-auto flex items-center gap-1">
          {confirm ? (
            <>
              <span className="text-xs text-muted-foreground">付いているタグは残ります</span>
              <Button size="sm" variant="destructive" disabled={pending} onClick={() => start(async () => { try { await deleteTagRule(rule.id); toast.success("ルールを削除しました"); } catch (e) { toast.error(actionErrorMessage(e)); } })}>削除する</Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirm(false)}>やめる</Button>
            </>
          ) : (
            <>
              <Button
                size="sm" variant="ghost" disabled={pending} title="今あるメールにもこのルールを適用する"
                onClick={() => start(async () => {
                  try {
                    const r = await applyTagRuleToExisting(rule.id);
                    if (r.matched === 0) toast.info("一致する過去のメールはありませんでした");
                    else toast.success(`過去のメール ${r.matched} 件が一致し、スレッド内の ${r.tagged} 件に「${tag?.name ?? "タグ"}」を付けました`);
                  } catch (e) {
                    toast.error(actionErrorMessage(e));
                  }
                })}
              >
                <History className="size-4" /> {pending ? "適用中..." : "過去分にも適用"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(true)} aria-label="編集"><Pencil className="size-4" /></Button>
              <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setConfirm(true)} aria-label="削除"><Trash2 className="size-4" /></Button>
            </>
          )}
        </div>
      </div>
    );
  }
  return (
    <form
      className="flex flex-wrap items-center gap-2 py-1.5"
      action={(fd) =>
        start(async () => {
          try {
            await updateTagRule(rule.id, fd);
            toast.success("保存しました");
            setEditing(false);
          } catch (e) {
            toast.error(actionErrorMessage(e));
          }
        })
      }
    >
      <RuleFields rule={rule} tags={tags} />
      <div className="ml-auto flex gap-1">
        <Button size="sm" variant="ghost" type="button" onClick={() => setEditing(false)}>キャンセル</Button>
        <Button size="sm" type="submit" disabled={pending}>保存</Button>
      </div>
    </form>
  );
}

/** 自動タグ付けルールの設定(タグの設定の下)。同期で取り込んだメールの件名・差出人・宛先がキーワードを含めば、スレッドにタグを付ける */
export function TagRuleSettings({ rules, tags }: { rules: EmailTagRule[]; tags: Tag[] }) {
  const [pending, start] = useTransition();
  const full = rules.length >= MAX_TAG_RULES;
  return (
    <div className="space-y-3">
      <div className="divide-y rounded-md border px-3">
        {rules.length === 0 && <p className="py-3 text-sm text-muted-foreground">ルールがありません。例: 件名に「出荷登録のお知らせ (自動メール)」を含む → 削除リスト</p>}
        {rules.map((r) => <RuleRow key={r.id} rule={r} tags={tags} />)}
      </div>
      <form
        id="tag-rule-create-form"
        className="flex flex-wrap items-center gap-2"
        action={(fd) =>
          start(async () => {
            try {
              await createTagRule(fd);
              toast.success("ルールを追加しました");
              (document.getElementById("tag-rule-create-form") as HTMLFormElement | null)?.reset();
            } catch (e) {
              toast.error(actionErrorMessage(e));
            }
          })
        }
      >
        <RuleFields tags={tags} />
        <Button size="sm" type="submit" disabled={pending || full || tags.length === 0}><Plus className="size-4" /> 追加</Button>
      </form>
      <p className="text-xs text-muted-foreground">
        同期で取り込んだメールに自動で付きます(スレッド内のメールにも付き、担当者には付きません)。全角半角・大文字小文字は区別せず、「、」で区切るとどれか 1 つ含めば一致します。
        「宛先」は To と CC のメールアドレスで判定するので、特定のアドレス(例: info@example.com)宛てに届いたメール全部にタグを付けられます。
        今あるメールには「過去分にも適用」で付けられます。「削除リスト」が付いたメールは「問い合わせに登録」の対象から外れます。ルールは {MAX_TAG_RULES} 個まで(現在 {rules.length} 個)。
      </p>
    </div>
  );
}
