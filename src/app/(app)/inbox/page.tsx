import Link from "next/link";
import { Inbox, PenSquare } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ComposeDialog } from "@/components/inbox/compose-dialog";
import { MailSyncButton } from "@/components/inbox/mail-sync-button";
import { InboxList, type InboxThread } from "@/components/inbox/inbox-list";
import { getMailAccountOptions } from "@/lib/mail/options";
import type { Email } from "@/lib/types";

export const metadata = { title: "メール" };

const FILTERS = [
  { key: "all", label: "すべて" },
  { key: "unread", label: "未読" },
  { key: "inbound", label: "受信" },
  { key: "outbound", label: "送信" },
  { key: "no_inquiry", label: "問い合わせ未登録" },
  { key: "unlinked", label: "案件未紐付け" },
];

export default async function InboxPage({ searchParams }: PageProps<"/inbox">) {
  const sp = await searchParams;
  const filter = typeof sp.filter === "string" ? sp.filter : "all";
  const q = typeof sp.q === "string" ? sp.q.trim() : "";

  const supabase = await createClient();
  let query = supabase
    .from("emails")
    .select("id, thread_key, direction, from_address, from_name, to_addresses, subject, snippet, received_at, is_read, deal_id, inquiry_id, company:companies(id,name), deal:deals(id,title)")
    .order("received_at", { ascending: false })
    .limit(300);
  if (filter === "unread") query = query.eq("is_read", false).eq("direction", "inbound");
  if (filter === "inbound" || filter === "outbound") query = query.eq("direction", filter);
  if (filter === "no_inquiry") query = query.is("inquiry_id", null).eq("direction", "inbound");
  if (filter === "unlinked") query = query.is("deal_id", null).eq("direction", "inbound");
  if (q) query = query.or(`subject.ilike.%${q}%,from_address.ilike.%${q}%,from_name.ilike.%${q}%,snippet.ilike.%${q}%`);

  const [{ data }, accounts] = await Promise.all([query, getMailAccountOptions(supabase)]);
  const emails = (data ?? []) as unknown as Email[];

  // スレッド単位で最新1件にまとめる
  const seen = new Set<string>();
  const threads: InboxThread[] = [];
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
      ...counts.get(e.thread_key)!,
    });
  }

  return (
    <div>
      <PageHeader
        title="メール"
        description="Gmail の受信・送信履歴。対応が必要なメールを選んで問い合わせに登録します。"
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
        <InboxList threads={threads} />
      )}
    </div>
  );
}
