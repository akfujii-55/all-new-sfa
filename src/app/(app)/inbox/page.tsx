import Link from "next/link";
import { ChevronDown, Inbox, PenSquare, Search, Trash2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ComposeDialog } from "@/components/inbox/compose-dialog";
import { MailSyncButton } from "@/components/inbox/mail-sync-button";
import { InboxList, type InboxThread } from "@/components/inbox/inbox-list";
import { getMailAccountOptions } from "@/lib/mail/options";
import { TagFilter } from "@/components/tags/tag-filter";
import { AccountFilter } from "@/components/inbox/account-filter";
import { tagsFromRows } from "@/lib/tags";
import type { Email, Tag } from "@/lib/types";

export const metadata = { title: "メール" };

/** 一度に読むメールの通数(スレッドにまとめる前)。「さらに表示」で n 倍ずつ増やす */
const PAGE_SIZE = 300;
const CHUNK = 1000;

const FILTERS = [
  { key: "all", label: "すべて" },
  { key: "unread", label: "未読" },
  { key: "inbound", label: "受信" },
  { key: "outbound", label: "送信" },
  { key: "no_inquiry", label: "問い合わせ未登録" },
  { key: "unlinked", label: "案件未紐付け" },
];

/** 検索対象。all は下記すべてを OR で検索する */
const SEARCH_TARGETS = [
  { key: "all", label: "すべて", columns: ["subject", "from_name", "from_address", "text_body"] },
  { key: "from", label: "送信者", columns: ["from_name", "from_address"] },
  { key: "subject", label: "件名", columns: ["subject"] },
  { key: "body", label: "本文", columns: ["text_body"] },
] as const;
type SearchTarget = (typeof SEARCH_TARGETS)[number]["key"];

/**
 * PostgREST の or フィルタ用に ilike のパターンを組み立てる。
 * カンマ・括弧・ダブルクォートを含む語でも壊れないよう値全体を引用符で囲み、
 * LIKE のワイルドカード(% _ \)は文字どおりに検索する。
 * 引用符内では PostgREST がバックスラッシュをエスケープ文字として扱うため、
 * LIKE 用のエスケープを施したあとにバックスラッシュ自体を二重にする。
 */
function buildSearchFilter(q: string, target: SearchTarget) {
  const likeEscaped = q.replace(/[\\%_]/g, (c) => `\\${c}`);
  const quoted = likeEscaped.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const pattern = `"%${quoted}%"`;
  const columns = SEARCH_TARGETS.find((t) => t.key === target)?.columns ?? SEARCH_TARGETS[0].columns;
  return columns.map((c) => `${c}.ilike.${pattern}`).join(",");
}

export default async function InboxPage({ searchParams }: PageProps<"/inbox">) {
  const sp = await searchParams;
  const filter = typeof sp.filter === "string" ? sp.filter : "all";
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const target: SearchTarget = SEARCH_TARGETS.some((t) => t.key === sp.in) ? (sp.in as SearchTarget) : "all";
  const tagId = typeof sp.tag === "string" && sp.tag ? sp.tag : null;
  const accountId = typeof sp.account === "string" && sp.account ? sp.account : null;
  const pages = Math.min(50, Math.max(1, Number(sp.n) || 1));
  const limit = PAGE_SIZE * pages;

  const supabase = await createClient();
  type Row = Email & { tags?: { tag: Tag | Tag[] | null }[] };
  // PostgREST は 1 回の要求で最大 1000 行なので、上限まで 1000 行ずつ読む
  const fetchEmails = async () => {
    const rows: Row[] = [];
    for (let from = 0; from < limit; from += CHUNK) {
      let query = supabase
        .from("emails")
        .select(
          "id, thread_key, direction, from_address, from_name, to_addresses, subject, snippet, received_at, is_read, deal_id, inquiry_id, account_id, company:companies(id,name), deal:deals(id,title), attachments:email_attachments(count), tags:email_tags(tag:tags(id,name,color,sort_order,created_at))" +
            (tagId ? ", filter_tags:email_tags!inner(tag_id)" : ""),
        )
        .order("received_at", { ascending: false })
        .range(from, Math.min(limit, from + CHUNK) - 1);
      if (tagId) query = query.eq("filter_tags.tag_id", tagId);
      if (accountId) query = query.eq("account_id", accountId);
      if (filter === "unread") query = query.eq("is_read", false).eq("direction", "inbound");
      if (filter === "inbound" || filter === "outbound") query = query.eq("direction", filter);
      if (filter === "no_inquiry") query = query.is("inquiry_id", null).eq("direction", "inbound");
      if (filter === "unlinked") query = query.is("deal_id", null).eq("direction", "inbound");
      if (q) query = query.or(buildSearchFilter(q, target));
      const { data } = await query;
      const chunk = (data ?? []) as unknown as Row[];
      rows.push(...chunk);
      if (chunk.length < Math.min(CHUNK, limit - from)) break;
    }
    return rows;
  };

  const [emails, accounts, { data: tagRows }, { data: trashRows }] = await Promise.all([
    fetchEmails(),
    getMailAccountOptions(supabase),
    supabase.from("tags").select("*").order("sort_order").order("created_at"),
    supabase.from("email_trash").select("thread_key"),
  ]);
  const allTags = (tagRows ?? []) as Tag[];
  const trashCount = new Set((trashRows ?? []).map((r) => r.thread_key as string)).size;
  // アカウントが 2 つ以上あるときだけ、絞り込みの行と各行のアカウント名を出す
  const accountById = new Map(accounts.map((a) => [a.id, a]));
  const showAccounts = accounts.length > 1;
  // 上限いっぱいまで読めたら、まだ古いメールが残っている可能性がある
  const hasMore = emails.length >= limit;

  // スレッド単位で最新1件にまとめる
  const seen = new Set<string>();
  const threads: InboxThread[] = [];
  const counts = new Map<string, { count: number; unread: number; attachments: number; tags: Tag[] }>();
  for (const e of emails) {
    const c = counts.get(e.thread_key) ?? { count: 0, unread: 0, attachments: 0, tags: [] };
    c.count++;
    c.attachments += (e as unknown as { attachments?: { count: number }[] }).attachments?.[0]?.count ?? 0;
    if (!e.is_read && e.direction === "inbound") c.unread++;
    // スレッド内のメールに付いたタグをまとめる(重複は除く)
    for (const t of tagsFromRows(e.tags)) if (!c.tags.some((x) => x.id === t.id)) c.tags.push(t);
    counts.set(e.thread_key, c);
  }
  for (const e of emails) {
    if (seen.has(e.thread_key)) continue;
    seen.add(e.thread_key);
    threads.push({
      id: e.id,
      direction: e.direction,
      from_address: e.from_address,
      from_name: e.from_name,
      to_addresses: e.to_addresses,
      subject: e.subject,
      snippet: e.snippet,
      received_at: e.received_at,
      inquiry_id: e.inquiry_id,
      company: e.company ?? null,
      deal: e.deal ?? null,
      account: showAccounts && !accountId && e.account_id ? (accountById.get(e.account_id)?.label ?? accountById.get(e.account_id)?.email ?? null) : null,
      ...counts.get(e.thread_key)!,
    });
  }

  const accountQuery = accountId ? `&account=${accountId}` : "";
  const searchQuery = (q ? `&q=${encodeURIComponent(q)}&in=${target}` : "") + (tagId ? `&tag=${tagId}` : "") + accountQuery;
  const hrefForTag = (id: string | null) => `/inbox?filter=${filter}${q ? `&q=${encodeURIComponent(q)}&in=${target}` : ""}${id ? `&tag=${id}` : ""}${accountQuery}`;
  const hrefForAccount = (id: string | null) => `/inbox?filter=${filter}${q ? `&q=${encodeURIComponent(q)}&in=${target}` : ""}${tagId ? `&tag=${tagId}` : ""}${id ? `&account=${id}` : ""}`;
  const moreHref = `/inbox?filter=${filter}${searchQuery}&n=${pages + 1}`;

  return (
    <div>
      <PageHeader
        title="メール"
        description="連携したメールアカウントの受信・送信履歴。対応が必要なメールを選んで問い合わせに登録します。"
        actions={
          <>
            <MailSyncButton />
            <ComposeDialog accounts={accounts} trigger={<Button size="sm"><PenSquare className="size-4" /> 新規作成</Button>} />
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <Button key={f.key} asChild size="sm" variant={filter === f.key ? "default" : "outline"}>
            <Link href={`/inbox?filter=${f.key}${searchQuery}`}>{f.label}</Link>
          </Button>
        ))}
        <form className="ml-auto flex items-center gap-2" action="/inbox">
          <input type="hidden" name="filter" value={filter} />
          {tagId && <input type="hidden" name="tag" value={tagId} />}
          {accountId && <input type="hidden" name="account" value={accountId} />}
          {pages > 1 && <input type="hidden" name="n" value={pages} />}
          <select
            name="in"
            defaultValue={target}
            aria-label="検索対象"
            className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
          >
            {SEARCH_TARGETS.map((t) => (
              <option key={t.key} value={t.key}>{t.label}</option>
            ))}
          </select>
          <Input name="q" defaultValue={q} placeholder="検索する語句" className="w-56" />
          <Button type="submit" size="sm" variant="outline" aria-label="検索">
            <Search className="size-4" /> 検索
          </Button>
          {q && (
            <Button asChild size="sm" variant="ghost" aria-label="検索を解除">
              <Link href={`/inbox?filter=${filter}${tagId ? `&tag=${tagId}` : ""}${accountQuery}`}><X className="size-4" /> 解除</Link>
            </Button>
          )}
        </form>
        <Button asChild size="sm" variant="ghost" className="text-muted-foreground">
          <Link href="/inbox/trash"><Trash2 className="size-4" /> ゴミ箱{trashCount > 0 ? `(${trashCount})` : ""}</Link>
        </Button>
      </div>

      {showAccounts && <AccountFilter accounts={accounts} active={accountId} hrefFor={hrefForAccount} />}
      <TagFilter tags={allTags} active={tagId} hrefFor={hrefForTag} />

      {q && (
        <p className="mb-3 text-sm text-muted-foreground">
          「{q}」を{SEARCH_TARGETS.find((t) => t.key === target)?.label}から検索: {threads.length} 件のスレッド
        </p>
      )}

      {threads.length === 0 && (q || tagId || accountId) ? (
        <EmptyState icon={Search} title="該当するメールがありません" description="語句・検索対象・タグ・アカウントを変えて再度お試しください。" />
      ) : threads.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="メールがありません"
          description="「メール同期」を押すと、連携したメールアカウントの受信トレイと送信済みメールを取り込みます。"
          action={<MailSyncButton label="今すぐ同期" />}
        />
      ) : (
        <>
          <InboxList threads={threads} tags={allTags} />
          {hasMore && (
            <div className="mt-3 flex items-center justify-center gap-3 text-sm text-muted-foreground">
              <span>新しい順に {emails.length} 通まで表示しています</span>
              <Button asChild size="sm" variant="outline">
                <Link href={moreHref}><ChevronDown className="size-4" /> さらに表示</Link>
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
