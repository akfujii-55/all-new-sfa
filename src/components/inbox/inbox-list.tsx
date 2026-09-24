"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight, MessageSquareText, Paperclip, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { createInquiriesFromEmails } from "@/actions/inquiries";
import { deleteEmailThreads, restoreEmailThreads } from "@/actions/emails";
import { TRASH_RETENTION_DAYS } from "@/lib/trash";
import { setEmailTags } from "@/actions/tags";
import { TagPicker } from "@/components/tags/tag-picker";
import { TagBadges } from "@/components/tags/tag-badge";
import type { Tag } from "@/lib/types";
import { fmtDateTime, fmtMailTime } from "@/lib/format";
import { useLocalPref } from "@/lib/local-pref";
import { cn } from "@/lib/utils";

import { actionErrorMessage } from "@/lib/errors";
export interface InboxThread {
  id: string;
  direction: "inbound" | "outbound";
  from_address: string;
  from_name: string | null;
  to_addresses: string[];
  subject: string | null;
  snippet: string | null;
  received_at: string;
  inquiry_id: string | null;
  count: number;
  unread: number;
  /** スレッド内の添付ファイル数 */
  attachments: number;
  company: { id: string; name: string } | null;
  deal: { id: string; title: string } | null;
  /** 受信・送信に使ったメールアカウントの表示名(アカウントが複数あり、絞り込んでいないときだけ) */
  account?: string | null;
  /** スレッド内のメールに付いたタグ */
  tags: Tag[];
}

/** 一覧の密度。コンパクトは本文の冒頭を隠して 1 スレッド 1 行にする(ブラウザごとに記憶) */
const DENSITIES = ["normal", "compact"] as const;

export function InboxList({ threads, tags }: { threads: InboxThread[]; tags: Tag[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [density, setDensity] = useLocalPref("inbox_density", "normal", DENSITIES);
  const compact = density === "compact";
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, start] = useTransition();

  const ids = threads.map((t) => t.id);
  const allChecked = ids.length > 0 && ids.every((id) => selected.has(id));
  const someChecked = ids.some((id) => selected.has(id));
  const selectedIds = ids.filter((id) => selected.has(id));
  const registrable = threads.filter((t) => selected.has(t.id) && !t.inquiry_id).length;
  // 選択中のスレッドに付いているタグ(tag_id → 付いているスレッド数)
  const currentTags = new Map<string, number>();
  for (const t of threads) {
    if (!selected.has(t.id)) continue;
    for (const tag of t.tags) currentTags.set(tag.id, (currentTags.get(tag.id) ?? 0) + 1);
  }

  function toggle(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }
  function toggleAll(checked: boolean) {
    setSelected(checked ? new Set(ids) : new Set());
  }

  function registerInquiries() {
    start(async () => {
      try {
        const r = await createInquiriesFromEmails(selectedIds);
        const notes = [r.skipped ? `登録済み ${r.skipped}件はスキップ` : null, r.deleteList ? `「削除リスト」${r.deleteList}件は対象外` : null].filter(Boolean);
        if (r.created > 0) toast.success(`${r.created}件を問い合わせに登録しました${notes.length ? `(${notes.join("、")})` : ""}`);
        else if (r.deleteList > 0 && r.skipped === 0) toast.info("選択したメールは「削除リスト」のため登録しませんでした");
        else toast.info(`選択したメールはすべて問い合わせ登録済みです${r.deleteList ? `(「削除リスト」${r.deleteList}件は対象外)` : ""}`);
        setSelected(new Set());
      } catch (e) {
        toast.error(actionErrorMessage(e));
      }
    });
  }

  function applyTags(change: { add: string[]; remove: string[] }) {
    start(async () => {
      try {
        const r = await setEmailTags(selectedIds, change);
        toast.success(`${selectedIds.length}件のスレッドのタグを更新しました${r.contacts ? `(担当者 ${r.contacts}名にも付与)` : ""}`);
        setSelected(new Set());
      } catch (e) {
        toast.error(actionErrorMessage(e));
      }
    });
  }

  function removeThreads() {
    start(async () => {
      try {
        const r = await deleteEmailThreads(selectedIds);
        toast.success(`${r.deleted}件のメールをゴミ箱に移動しました`, {
          action: { label: "元に戻す", onClick: () => undoDelete(r.threadKeys) },
        });
        setSelected(new Set());
        setConfirmDelete(false);
      } catch (e) {
        toast.error(actionErrorMessage(e));
      }
    });
  }

  function undoDelete(threadKeys: string[]) {
    start(async () => {
      try {
        const r = await restoreEmailThreads(threadKeys);
        toast.success(`${r.restored}件のメールを元に戻しました`);
      } catch (e) {
        toast.error(actionErrorMessage(e));
      }
    });
  }

  return (
    <div className="rounded-lg border bg-card">
      <div className="flex items-center gap-3 border-b px-4 py-2">
        <Checkbox
          checked={allChecked ? true : someChecked ? "indeterminate" : false}
          onCheckedChange={(v) => toggleAll(v === true)}
          aria-label="すべて選択"
        />
        {selectedIds.length > 0 ? (
          <>
            <span className="text-sm text-muted-foreground">{selectedIds.length}件選択</span>
            <Button size="sm" disabled={pending} onClick={registerInquiries}>
              <MessageSquareText className="size-4" /> 問い合わせに登録
            </Button>
            {registrable < selectedIds.length && (
              <span className="text-xs text-muted-foreground">
                {registrable === 0 ? "選択したメールはすべて登録済みです" : `${selectedIds.length - registrable}件は登録済みのためスキップされます`}
              </span>
            )}
            <TagPicker tags={tags} current={currentTags} onApply={applyTags} pending={pending} description="スレッド内のメールと、紐付く担当者にタグを付けます" />
            <Button size="sm" variant="outline" disabled={pending} onClick={() => setConfirmDelete(true)} className="text-destructive">
              <Trash2 className="size-4" /> 削除
            </Button>
          </>
        ) : (
          <span className="text-sm text-muted-foreground">メールを選択して問い合わせに登録、タグ付け、削除ができます</span>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
          <span className="mr-1 hidden sm:inline">表示</span>
          {DENSITIES.map((d) => (
            <Button key={d} size="sm" variant={density === d ? "secondary" : "ghost"} className="h-7 px-2 text-xs" onClick={() => setDensity(d)} aria-pressed={density === d}>
              {d === "normal" ? "通常" : "コンパクト"}
            </Button>
          ))}
        </div>
      </div>

      <div className="divide-y">
        {threads.map((t) => {
          const checked = selected.has(t.id);
          const unread = t.unread > 0;
          const who = t.direction === "inbound" ? t.from_name || t.from_address : `To: ${t.to_addresses.join(", ")}`;
          const whoTitle = t.direction === "inbound" ? t.from_address : t.to_addresses.join(", ");
          const hasMeta = Boolean(t.inquiry_id || t.company || t.deal || t.account || t.tags.length > 0);
          // 問い合わせ・取引先・案件・アカウント・タグ。通常は 2 行目、コンパクトでは 1 行目の右側(狭い画面では省略)
          const meta = hasMeta && (
            <>
              {t.inquiry_id && <Badge className="h-5 px-1.5 text-xs">問い合わせ</Badge>}
              {t.company && <Badge variant="secondary" className="h-5 max-w-40 px-1.5 text-xs"><span className="truncate">{t.company.name}</span></Badge>}
              {t.deal && <Badge variant="outline" className="hidden h-5 max-w-48 px-1.5 text-xs md:inline-flex"><span className="truncate">{t.deal.title}</span></Badge>}
              <TagBadges tags={t.tags} max={3} />
              {t.account && <span className="hidden truncate text-xs text-muted-foreground lg:inline">@ {t.account}</span>}
            </>
          );
          return (
            // 差出人を固定幅の列にして縦に揃え、件名と本文の冒頭を同じ行に置く(Gmail と同じ考え方)。
            // 未読: 薄い青の背景 + 左端のアクセント線 + 太字。既読: 白背景で文字を少し落とす
            <div
              key={t.id}
              className={cn(
                "relative flex items-center gap-3 px-4 transition-colors",
                compact ? "py-2" : "py-3",
                unread
                  ? "bg-sky-50/70 hover:bg-sky-100/70 dark:bg-sky-950/30 dark:hover:bg-sky-950/50 before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-sky-500"
                  : "hover:bg-accent/50",
                checked && "bg-accent/60 dark:bg-accent/40",
              )}
            >
              <Checkbox checked={checked} onCheckedChange={(v) => toggle(t.id, v === true)} aria-label="選択" />
              <Link href={`/inbox/${t.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                <div className={cn("flex size-5 shrink-0 items-center justify-center rounded-full", t.direction === "inbound" ? "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300")} title={t.direction === "inbound" ? "受信" : "送信"}>
                  {t.direction === "inbound" ? <ArrowDownLeft className="size-3" /> : <ArrowUpRight className="size-3" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-baseline gap-3">
                    <span className="flex w-28 shrink-0 items-baseline gap-1 sm:w-48 lg:w-56">
                      <span className={cn("min-w-0 truncate text-[15px] leading-6", unread ? "font-bold text-foreground" : "font-medium text-foreground/80")} title={whoTitle}>{who}</span>
                      {t.count > 1 && <span className="shrink-0 text-xs text-muted-foreground">{t.count}</span>}
                    </span>
                    <span className="flex min-w-0 flex-1 items-baseline gap-1.5">
                      <span className={cn("truncate text-[15px] leading-6", compact ? "min-w-0" : "max-w-[60%] shrink-0", unread ? "font-bold text-foreground" : "text-foreground/80")}>{t.subject || "(件名なし)"}</span>
                      {!compact && t.snippet && <span className="min-w-0 flex-1 truncate text-[13px] text-muted-foreground">– {t.snippet}</span>}
                    </span>
                    {compact && meta && <span className="hidden shrink-0 items-center gap-1.5 md:inline-flex">{meta}</span>}
                  </div>
                  {!compact && meta && <div className="mt-1 flex items-center gap-1.5 overflow-hidden">{meta}</div>}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className={cn("flex items-center gap-1.5 whitespace-nowrap text-xs tabular-nums", unread ? "font-semibold text-sky-700 dark:text-sky-300" : "text-muted-foreground")} title={fmtDateTime(t.received_at)}>
                    {t.attachments > 0 && <Paperclip className="size-3.5" aria-label={`添付ファイル ${t.attachments}件`} />}
                    {fmtMailTime(t.received_at)}
                  </span>
                  {unread && !compact && <span className="size-2 rounded-full bg-sky-500" aria-label="未読" />}
                </div>
              </Link>
            </div>
          );
        })}
      </div>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>メールをゴミ箱に移動しますか?</DialogTitle>
            <DialogDescription>
              選択した {selectedIds.length} 件のスレッド(スレッド内のメールすべて)をゴミ箱に移動します。{TRASH_RETENTION_DAYS} 日間は「ゴミ箱」から元に戻せます。メールサーバー側のメールは削除されません。登録済みの問い合わせ・案件は残ります。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)} disabled={pending}>キャンセル</Button>
            <Button variant="destructive" onClick={removeThreads} disabled={pending}>{pending ? "移動中..." : "ゴミ箱に移動"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
