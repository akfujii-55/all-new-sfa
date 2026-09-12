"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Tag as TagIcon } from "lucide-react";
import { setEmailTags } from "@/actions/tags";
import { TagPicker } from "@/components/tags/tag-picker";
import { TagBadges } from "@/components/tags/tag-badge";
import { Button } from "@/components/ui/button";
import type { Tag } from "@/lib/types";

/** スレッド画面の「関連情報」に出すタグ(表示 + 付け外し) */
export function ThreadTags({ emailId, tags, current }: { emailId: string; tags: Tag[]; current: Tag[] }) {
  const [pending, start] = useTransition();
  const map = new Map(current.map((t) => [t.id, 1]));
  return (
    <div className="flex items-start gap-2">
      <TagIcon className="size-4 mt-0.5 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">タグ</p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {current.length > 0 ? <TagBadges tags={current} max={8} /> : <span className="text-xs text-muted-foreground">なし</span>}
          <TagPicker
            tags={tags}
            current={map}
            pending={pending}
            description="このスレッドと紐付く担当者にタグを付けます"
            trigger={<Button size="sm" variant="ghost" className="h-6 px-1.5 text-xs" disabled={pending}>変更</Button>}
            onApply={(change) =>
              start(async () => {
                try {
                  await setEmailTags([emailId], change);
                  toast.success("タグを更新しました");
                } catch (e) {
                  toast.error((e as Error).message);
                }
              })
            }
          />
        </div>
      </div>
    </div>
  );
}
