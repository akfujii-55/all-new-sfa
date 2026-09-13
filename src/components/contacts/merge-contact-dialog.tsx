"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { mergeContacts } from "@/actions/links";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { PickerList } from "@/components/links/picker-list";

export interface MergeContactCandidate {
  id: string;
  name: string;
  email?: string | null;
  company_id?: string | null;
  company?: { id: string; name: string } | null;
}

/** 重複して作られた担当者を別の担当者にまとめる。この担当者(source)を選んだ担当者(target)に統合して削除する */
export function MergeContactDialog({ trigger, contact, contacts, companies }: { trigger: ReactNode; contact: { id: string; name: string; email?: string | null }; contacts: MergeContactCandidate[]; companies?: { id: string; name: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const target = contacts.find((c) => c.id === targetId);
  const companyName = new Map((companies ?? []).map((c) => [c.id, c.name]));
  const subOf = (c: MergeContactCandidate) => [c.company?.name ?? (c.company_id ? companyName.get(c.company_id) : null), c.email].filter(Boolean).join(" · ") || null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <span className="contents">{trigger}</span>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>担当者を統合</DialogTitle>
          <DialogDescription>
            「{contact.name}」のメール・問い合わせ・案件・タグを、選んだ担当者に移してから「{contact.name}」を削除します。移動先のメールアドレス・電話・役職が空なら「{contact.name}」の値で埋めます。
            {contact.email && " 移動先に別のメールアドレスがある場合、「" + contact.email + "」は担当者のアドレスとして残らないため、今後このアドレスから届いたメールは新しい担当者として登録されます。"}
            元に戻せません。
          </DialogDescription>
        </DialogHeader>
        <PickerList
          items={contacts.filter((c) => c.id !== contact.id).map((c) => ({ id: c.id, label: c.name, sub: subOf(c) }))}
          value={targetId}
          onChange={setTargetId}
          placeholder="統合先の担当者名・会社名・メールで検索"
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
                  await mergeContacts(contact.id, targetId!);
                  toast.success(`「${target?.name}」に統合しました`);
                  setOpen(false);
                  router.refresh();
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
