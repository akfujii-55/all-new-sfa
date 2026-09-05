import Link from "next/link";
import { Inbox, PenSquare, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ComposeDialog } from "@/components/inbox/compose-dialog";
import { MailSyncButton } from "@/components/inbox/mail-sync-button";
import { fmtRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Email } from "@/lib/types";

export const metadata = { title: "メール" };

const FILTERS = [
  { key: "all", label: "すべて" },
  { key: "unread", label: "未読" },
  { key: "inbound", label: "受信" },
  { key: "outbound", label: "送信" },
  { key: "unlinked", label: "案件未紐付け" },
];

export default async function InboxPage({ searchParams }: PageProps<"/inbox">) {
  const sp = await searchParams;
  const filter = typeof sp.filter === "string" ? sp.filter : "all";
  const q = typeof sp.q === "string" ? sp.q.trim() : "";

  const supabase = await createClient();
  let query = supabase
    .from("emails")
    .select("id, thread_key, direction, from_address, from_name, to_addresses, subject, snippet, received_at, is_read, deal_id, company:companies(id,name), deal:deals(id,title)")
    .order("received_at", { ascending: false })
    .limit(300);
  if (filter === "unread") query = query.eq("is_read", false).eq("direction", "inbound");
  if (filter === "inbound" || filter === "outbound") query = query.eq("direction", filter);
  if (filter === "unlinked") query = query.is("deal_id", null).eq("direction", "inbound");
  if (q) query = query.or(`subject.ilike.%${q}%,from_address.ilike.%${q}%,from_name.ilike.%${q}%,snippet.ilike.%${q}%`);

  const { data } = await query;
  const emails = (data ?? []) as unknown as Email[];

  // スレッド単位で最新1件にまとめる
  const seen = new Set<string>();
  const threads: (Email & { count: number; unread: number })[] = [];
  const counts = new Map<string, { count: number; unread: number }>();
  for (const e of emails) {
    const c = counts.get(e.thread_key) ?? { count: 0, unread: 0 };
    c.count++;
    if (!e.is_read && e.direction === "inbound") c.unread++;
    counts.set(e.thread_key, c);
  }
  for (const e of emails) {
    if (seen.has(e.thread_key)) continue;
    seen.add(e.thread_key);
    threads.push({ ...e, ...counts.get(e.thread_key)! });
  }

  return (
    <div>
      <PageHeader
        title="メール"
        description="Gmail の受信・送信履歴。顧客・案件に自動で紐付きます。"
        actions={
          <>
            <MailSyncButton />
            <ComposeDialog trigger={<Button size="sm"><PenSquare className="size-4" /> 新規作成</Button>} />
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <Button key={f.key} asChild size="sm" variant={filter === f.key ? "default" : "outline"}>
            <Link href={`/inbox?filter=${f.key}${q ? `&q=${encodeURIComponent(q)}` : ""}`}>{f.label}</Link>
          </Button>
        ))}
        <form className="ml-auto flex gap-2" action="/inbox">
          <input type="hidden" name="filter" value={filter} />
          <Input name="q" defaultValue={q} placeholder="件名・送信者を検索" className="w-56" />
        </form>
      </div>

      {threads.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="メールがありません"
          description="「メール同期」を押すと Gmail の受信トレイと送信済みメールを取り込みます。"
          action={<MailSyncButton label="今すぐ同期" />}
        />
      ) : (
        <div className="rounded-lg border divide-y bg-card">
          {threads.map((t) => (
            <Link key={t.id} href={`/inbox/${t.id}`} className="flex items-start gap-3 px-4 py-3 hover:bg-accent/50 transition-colors">
              <div className={cn("mt-1 flex size-8 shrink-0 items-center justify-center rounded-full", t.direction === "inbound" ? "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300")}>
                {t.direction === "inbound" ? <ArrowDownLeft className="size-4" /> : <ArrowUpRight className="size-4" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className={cn("truncate text-sm", t.unread > 0 ? "font-semibold" : "font-medium")}>
                    {t.direction === "inbound" ? t.from_name || t.from_address : `To: ${t.to_addresses.join(", ")}`}
                  </span>
                  {t.count > 1 && <span className="text-xs text-muted-foreground">({t.count})</span>}
                  {t.company && <Badge variant="secondary" className="hidden sm:inline-flex">{t.company.name}</Badge>}
                  {t.deal && <Badge variant="outline" className="hidden md:inline-flex">{t.deal.title}</Badge>}
                </div>
                <p className={cn("truncate text-sm", t.unread > 0 ? "font-medium" : "text-foreground/90")}>{t.subject || "(件名なし)"}</p>
                <p className="truncate text-xs text-muted-foreground">{t.snippet}</p>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <span className="text-xs text-muted-foreground whitespace-nowrap">{fmtRelative(t.received_at)}</span>
                {t.unread > 0 && <span className="size-2 rounded-full bg-sky-500" />}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
