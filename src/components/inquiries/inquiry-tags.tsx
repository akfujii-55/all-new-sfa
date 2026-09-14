"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { setEmailTags } from "@/actions/tags";
import { TagPicker } from "@/components/tags/tag-picker";
import { TagBadges } from "@/components/tags/tag-badge";
import { Button } from "@/components/ui/button";
import type { Tag } from "@/lib/types";

import { actionErrorMessage } from "@/lib/errors";
/**
 * 問い合わせのタグ。問い合わせ専用のタグは持たず、紐付くメール(スレッド)のタグをそのまま表示・編集する。
 * 付け外しはスレッド内の全メール(と紐付く担当者)に反映されるので、メール画面と常に同じになる。
 */
export function InquiryTags({ emailIds, tags, current }: { emailIds: string[]; tags: Tag[]; current: Tag[] }) {
  const [pending, start] = useTransition();
  const map = new Map(current.map((t) => [t.id, emailIds.length]));
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <TagBadges tags={current} max={6} />
      {emailIds.length > 0 && (
        <TagPicker
          tags={tags}
          current={map}
          pending={pending}
          description="この問い合わせのメールと紐付く担当者にタグを付けます"
          trigger={<Button size="sm" variant="ghost" className="h-6 px-1.5 text-xs text-muted-foreground" disabled={pending}>{current.length > 0 ? "タグを変更" : "タグを付ける"}</Button>}
          onApply={(change) =>
            start(async () => {
              try {
                await setEmailTags(emailIds, change);
                toast.success("タグを更新しました");
              } catch (e) {
                toast.error(actionErrorMessage(e));
              }
            })
          }
        />
      )}
    </span>
  );
}
