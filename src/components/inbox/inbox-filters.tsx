"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AtSign, Search, Tag as TagIcon, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { MailAccountOption, Tag } from "@/lib/types";

export interface InboxFilterState {
  filter: string;
  q: string;
  target: string;
  tagId: string | null;
  accountId: string | null;
}

/** 絞り込みの状態から一覧の URL を組み立てる(「さらに表示」の n は条件を変えたら最初に戻す) */
export function inboxHref(s: InboxFilterState) {
  const p = new URLSearchParams();
  p.set("filter", s.filter);
  if (s.q) {
    p.set("q", s.q);
    p.set("in", s.target);
  }
  if (s.tagId) p.set("tag", s.tagId);
  if (s.accountId) p.set("account", s.accountId);
  return `/inbox?${p.toString()}`;
}

const selectClass =
  "h-8 min-w-0 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

/**
 * メール一覧の絞り込み(状態・アカウント・タグ・検索)。
 * スマホでは状態・アカウント・タグを 3 つのプルダウンで 1 行に、検索欄を 2 行目に置く。
 * PC では状態はボタン列のまま、アカウント・タグだけプルダウンにする。
 */
export function InboxFilters({
  state,
  filters,
  targets,
  accounts,
  tags,
}: {
  state: InboxFilterState;
  filters: { key: string; label: string }[];
  targets: { key: string; label: string }[];
  accounts: MailAccountOption[];
  tags: Tag[];
}) {
  const router = useRouter();
  const go = (patch: Partial<InboxFilterState>) => router.push(inboxHref({ ...state, ...patch }));
  const showAccounts = accounts.length > 1;

  return (
    <div className="mb-4 flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {/* 状態: PC はボタン列 */}
        <div className="hidden flex-wrap items-center gap-2 sm:flex">
          {filters.map((f) => (
            <Button key={f.key} asChild size="sm" variant={state.filter === f.key ? "default" : "outline"}>
              <Link href={inboxHref({ ...state, filter: f.key })}>{f.label}</Link>
            </Button>
          ))}
        </div>

        {/* スマホ: 状態・アカウント・タグを 1 行に */}
        <div className="flex w-full items-center gap-2 sm:hidden">
          <select
            aria-label="状態"
            value={state.filter}
            onChange={(e) => go({ filter: e.target.value })}
            className={cn(selectClass, "flex-1", state.filter !== "all" && "border-foreground font-medium")}
          >
            {filters.map((f) => (
              <option key={f.key} value={f.key}>{f.label}</option>
            ))}
          </select>
          {showAccounts && <AccountSelect accounts={accounts} value={state.accountId} onChange={(v) => go({ accountId: v })} className="flex-1" />}
          {tags.length > 0 && <TagSelect tags={tags} value={state.tagId} onChange={(v) => go({ tagId: v })} className="flex-1" />}
        </div>

        {/* 検索: PC は右寄せ、スマホは 2 行目いっぱい */}
        <form className="flex w-full items-center gap-2 sm:ml-auto sm:w-auto" action="/inbox">
          <input type="hidden" name="filter" value={state.filter} />
          {state.tagId && <input type="hidden" name="tag" value={state.tagId} />}
          {state.accountId && <input type="hidden" name="account" value={state.accountId} />}
          <select name="in" defaultValue={state.target} aria-label="検索対象" className={cn(selectClass, "hidden sm:block")}>
            {targets.map((t) => (
              <option key={t.key} value={t.key}>{t.label}</option>
            ))}
          </select>
          <Input name="q" defaultValue={state.q} placeholder="検索する語句" className="min-w-0 flex-1 sm:w-56 sm:flex-none" />
          <Button type="submit" size="sm" variant="outline" aria-label="検索">
            <Search className="size-4" /> <span className="hidden sm:inline">検索</span>
          </Button>
          {state.q && (
            <Button asChild size="sm" variant="ghost" aria-label="検索を解除">
              <Link href={inboxHref({ ...state, q: "" })}><X className="size-4" /> <span className="hidden sm:inline">解除</span></Link>
            </Button>
          )}
        </form>
      </div>

      {/* PC: アカウント・タグのプルダウン */}
      {(showAccounts || tags.length > 0) && (
        <div className="hidden flex-wrap items-center gap-3 text-sm text-muted-foreground sm:flex">
          {showAccounts && (
            <label className="flex items-center gap-1.5">
              <AtSign className="size-4" />
              <AccountSelect accounts={accounts} value={state.accountId} onChange={(v) => go({ accountId: v })} />
            </label>
          )}
          {tags.length > 0 && (
            <label className="flex items-center gap-1.5">
              <TagIcon className="size-4" />
              <TagSelect tags={tags} value={state.tagId} onChange={(v) => go({ tagId: v })} />
            </label>
          )}
          {(state.accountId || state.tagId) && (
            <Link href={inboxHref({ ...state, accountId: null, tagId: null })} className="inline-flex items-center gap-0.5 text-xs hover:text-foreground">
              <X className="size-3" /> 解除
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

function AccountSelect({ accounts, value, onChange, className }: { accounts: MailAccountOption[]; value: string | null; onChange: (v: string | null) => void; className?: string }) {
  return (
    <select
      aria-label="アカウント"
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
      className={cn(selectClass, "text-foreground", value && "border-foreground font-medium", className)}
    >
      <option value="">アカウント: すべて</option>
      {accounts.map((a) => (
        <option key={a.id} value={a.id}>{a.label || a.email}</option>
      ))}
    </select>
  );
}

function TagSelect({ tags, value, onChange, className }: { tags: Tag[]; value: string | null; onChange: (v: string | null) => void; className?: string }) {
  return (
    <select
      aria-label="タグ"
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
      className={cn(selectClass, "text-foreground", value && "border-foreground font-medium", className)}
    >
      <option value="">タグ: すべて</option>
      {tags.map((t) => (
        <option key={t.id} value={t.id}>{t.name}</option>
      ))}
    </select>
  );
}
