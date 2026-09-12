import Link from "next/link";
import { Tag as TagIcon, X } from "lucide-react";
import { TagBadge } from "@/components/tags/tag-badge";
import { cn } from "@/lib/utils";
import type { Tag } from "@/lib/types";

/** タグで絞り込むリンクの列(サーバーコンポーネント)。hrefFor で他の検索条件を引き継ぐ */
export function TagFilter({ tags, active, hrefFor }: { tags: Tag[]; active: string | null; hrefFor: (tagId: string | null) => string }) {
  if (tags.length === 0) return null;
  return (
    <div className="mb-4 flex flex-wrap items-center gap-1.5 text-sm">
      <TagIcon className="size-4 text-muted-foreground" />
      <span className="mr-1 text-muted-foreground">タグ:</span>
      {tags.map((t) => (
        <Link key={t.id} href={hrefFor(active === t.id ? null : t.id)} className={cn("rounded-md ring-offset-background", active === t.id && "ring-2 ring-ring ring-offset-1")}>
          <TagBadge tag={t} className="px-2 py-1 text-xs" />
        </Link>
      ))}
      {active && (
        <Link href={hrefFor(null)} className="ml-1 inline-flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground"><X className="size-3" /> 解除</Link>
      )}
    </div>
  );
}
