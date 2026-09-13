"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { mergeCompanies } from "@/actions/links";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { PickerList } from "@/components/links/picker-list";

/** 重複して作られた取引先を別の取引先にまとめる。この取引先(source)を選んだ取引先(target)に統合して削除する */
export function MergeCompanyDialog({ trigger, company, companies }: { trigger: ReactNode; company: { id: string; name: string }; companies: { id: string; name: string; domain?: string | null }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const target = companies.find((c) => c.id === targetId);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <span className="contents">{trigger}</span>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>取引先を統合</DialogTitle>
          <DialogDescription>
            「{company.name}」の担当者・メール・問い合わせ・案件・売上を、選んだ取引先に移してから「{company.name}」を削除します。移動先の空欄(ドメイン・電話など)は「{company.name}」の値で埋めます。元に戻せません。
          </DialogDescription>
        </DialogHeader>
        <PickerList
          items={companies.filter((c) => c.id !== company.id).map((c) => ({ id: c.id, label: c.name, sub: c.domain ? `@${c.domain}` : null }))}
          value={targetId}
          onChange={setTargetId}
          placeholder="統合先の会社名で検索"
        />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>キャンセル</Button>
          <Button
            type="button"
            variant="destructive"
            disabled={pending || !targetId}
            onClick={() =>
              start(async () => {
                try {
                  await mergeCompanies(company.id, targetId!);
                  toast.success(`「${target?.name}」に統合しました`);
                  setOpen(false);
                  router.push(`/companies/${targetId}`);
                } catch (e) {
                  toast.error((e as Error).message);
                }
              })
            }
          >
            {pending ? "統合中..." : target ? `「${target.name}」に統合する` : "統合する"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
