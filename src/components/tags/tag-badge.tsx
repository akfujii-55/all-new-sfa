import { cn } from "@/lib/utils";
import { tagColorClass } from "@/lib/tags";
import type { Tag } from "@/lib/types";

export function TagBadge({ tag, className }: { tag: Pick<Tag, "name" | "color">; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium leading-none whitespace-nowrap", tagColorClass(tag.color), className)}>
      {tag.name}
    </span>
  );
}

export function TagBadges({ tags, max = 4 }: { tags: Tag[]; max?: number }) {
  if (tags.length === 0) return null;
  const shown = tags.slice(0, max);
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {shown.map((t) => <TagBadge key={t.id} tag={t} />)}
      {tags.length > max && <span className="text-[11px] text-muted-foreground">+{tags.length - max}</span>}
    </span>
  );
}
