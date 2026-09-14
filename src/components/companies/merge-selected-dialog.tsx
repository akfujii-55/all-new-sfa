"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { mergeManyCompanies } from "@/actions/links";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { actionErrorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";

export interface MergeSelectedCompany {
  id: string;
  name: string;
  domain: string | null;
  contactCount: number;
  dealCount: number;
  created_at: string;
}

/** 一覧で選んだ取引先を 1 社にまとめる。残す 1 社を選び、残りをそこへ統合して削除する */
export function MergeSelectedDialog({ trigger, companies, onDone }: { trigger: ReactNode; companies: MergeSelectedCompany[]; onDone?: () => void }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [keepId, setKeepId] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // 既定の「残す会社」は、担当者・案件が多い順 → ドメインあり → 古い順
  function onOpenChange(next: boolean) {
    if (next) {
      const sorted = [...companies].sort(
        (a, b) =>
          b.contactCount + b.dealCount - (a.contactCount + a.dealCount) ||
          Number(!!b.domain) - Number(!!a.domain) ||
          a.created_at.localeCompare(b.created_at),
      );
      setKeepId(sorted[0]?.id ?? null);
    }
    setOpen(next);
  }

  const keep = companies.find((c) => c.id === keepId);
  const sources = companies.filter((c) => c.id !== keepId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <span className="contents">{trigger}</span>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>選んだ {companies.length} 社を統合</DialogTitle>
          <DialogDescription>
            残す取引先を 1 つ選んでください。ほかの取引先の担当者・メール・問い合わせ・案件・売上はそこへ移り、取引先自体は削除されます。残す側の空欄(ドメイン・電話など)は統合元の値で埋めます。元に戻せません。
          </DialogDescription>
        </DialogHeader>
        <div role="radiogroup" className="max-h-80 space-y-1 overflow-y-auto rounded-md border p-1">
          {companies.map((c) => {
            const checked = c.id === keepId;
            return (
              <button
                key={c.id}
                type="button"
                role="radio"
                aria-checked={checked}
                onClick={() => setKeepId(c.id)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm hover:bg-accent",
                  checked && "bg-accent",
                )}
              >
                <span className={cn("size-4 shrink-0 rounded-full border", checked ? "border-primary bg-primary ring-2 ring-background ring-inset" : "border-input")} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{c.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {c.domain ? `@${c.domain}` : "ドメインなし"} ・ 担当者 {c.contactCount} 人 ・ 案件 {c.dealCount} 件
                  </span>
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">{checked ? "残す" : "統合して削除"}</span>
              </button>
            );
          })}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>キャンセル</Button>
          <Button
            type="button"
            variant="destructive"
            disabled={pending || !keepId || sources.length === 0}
            onClick={() =>
              start(async () => {
                try {
                  const r = await mergeManyCompanies(sources.map((c) => c.id), keepId!);
                  toast.success(`${r.merged} 社を「${keep?.name}」に統合しました`);
                  setOpen(false);
                  onDone?.();
                  router.refresh();
                } catch (e) {
                  toast.error(actionErrorMessage(e));
                }
              })
            }
          >
            {pending ? "統合中..." : keep ? `「${keep.name}」に ${sources.length} 社を統合する` : "統合する"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
