import type { Tag } from "@/lib/types";

/** タグの表示色(tags.color のキー)。バッジの背景と文字色 */
export const TAG_COLORS: { key: string; label: string; className: string }[] = [
  { key: "gray", label: "グレー", className: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200" },
  { key: "red", label: "赤", className: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300" },
  { key: "orange", label: "オレンジ", className: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300" },
  { key: "amber", label: "黄", className: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" },
  { key: "green", label: "緑", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" },
  { key: "teal", label: "青緑", className: "bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300" },
  { key: "sky", label: "水色", className: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300" },
  { key: "blue", label: "青", className: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300" },
  { key: "violet", label: "紫", className: "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300" },
  { key: "pink", label: "ピンク", className: "bg-pink-100 text-pink-700 dark:bg-pink-950 dark:text-pink-300" },
];

/** 1 テナントあたりのタグ数の上限 */
export const MAX_TAGS = 20;

export function tagColorClass(color: string | null | undefined) {
  return (TAG_COLORS.find((c) => c.key === color) ?? TAG_COLORS[0]).className;
}

/** PostgREST の埋め込み(tags:email_tags(tag:tags(...)))から Tag の配列に直す */
export function tagsFromRows(rows: { tag: Tag | Tag[] | null }[] | null | undefined): Tag[] {
  const out: Tag[] = [];
  for (const r of rows ?? []) {
    const t = Array.isArray(r.tag) ? r.tag[0] : r.tag;
    if (t) out.push(t);
  }
  return out.sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, "ja"));
}
