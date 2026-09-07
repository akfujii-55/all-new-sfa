import Link from "next/link";
import { MessageSquareText, Mail, KanbanSquare, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmailBody } from "@/components/inbox/email-body";
import { NewDealDialog } from "@/components/deals/new-deal-dialog";
import { InquiryStatusSelect } from "@/components/inquiries/inquiry-status-select";
import { fmtDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { INQUIRY_STATUS_LABEL, type Inquiry, type InquiryStatus } from "@/lib/types";

export const metadata = { title: "問い合わせ" };

export default async function InquiriesPage({ searchParams }: PageProps<"/inquiries">) {
  const sp = await searchParams;
  const status = typeof sp.status === "string" ? sp.status : "open";
  const focus = typeof sp.focus === "string" ? sp.focus : null;
  const supabase = await createClient();

  let query = supabase
    .from("inquiries")
    .select(
      "*, company:companies(id,name), contact:contacts(id,name,email), deal:deals!inquiries_deal_id_fkey(id,title), emails:emails!emails_inquiry_fk(id,direction,from_address,from_name,subject,text_body,received_at)",
    )
    .order("received_at", { ascending: false })
    .limit(200);
  if (status === "open") query = query.in("status", ["new", "in_progress"]);
  else if (status !== "all") query = query.eq("status", status);

  const [{ data }, { data: companies }, { data: contacts }, { data: members }] = await Promise.all([
    query,
    supabase.from("companies").select("id, name").order("name"),
    supabase.from("contacts").select("id, name, company_id").order("name"),
    supabase.from("members").select("id, name").eq("is_active", true).order("sort_order").order("created_at"),
  ]);
  const rows = (data ?? []) as unknown as Inquiry[];

  const tabs: { key: string; label: string }[] = [
    { key: "open", label: "未対応・対応中" },
    ...(Object.keys(INQUIRY_STATUS_LABEL) as InquiryStatus[]).map((k) => ({ key: k, label: INQUIRY_STATUS_LABEL[k] })),
    { key: "all", label: "すべて" },
  ];

  return (
    <div>
      <PageHeader
        title="問い合わせ"
        description="メール画面で選択して登録した問い合わせ。アポイントが取れたら案件化します。"
        actions={<Button asChild size="sm" variant="outline"><Link href="/inbox?filter=no_inquiry"><Mail className="size-4" /> メールから登録</Link></Button>}
      />
      <div className="mb-4 flex flex-wrap gap-2">
        {tabs.map((t) => (
          <Button key={t.key} asChild size="sm" variant={status === t.key ? "default" : "outline"}>
            <Link href={`/inquiries?status=${t.key}`}>{t.label}</Link>
          </Button>
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={MessageSquareText}
          title="問い合わせがありません"
          description="メール画面で対応が必要なメールにチェックを付け、「問い合わせに登録」を押すとここに表示されます。"
          action={<Button asChild size="sm"><Link href="/inbox?filter=no_inquiry"><Mail className="size-4" /> メールから登録</Link></Button>}
        />
      ) : (
        <div className="space-y-3">
          {rows.map((q) => {
            // 新しいものが上
            const thread = [...(q.emails ?? [])].sort((a, b) => b.received_at.localeCompare(a.received_at));
            const threadId = q.email_id ?? thread[0]?.id ?? null;
            const latestInbound = thread.find((e) => e.direction === "inbound") ?? thread[0] ?? null;
            return (
            <Card key={q.id} id={q.id} className={cn(focus === q.id && "ring-2 ring-primary")}>
              <CardContent className="pt-0">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-medium">
                        {threadId ? <Link href={`/inbox/${threadId}`} className="hover:underline">{q.subject}</Link> : q.subject}
                      </h3>
                      {q.category && <Badge variant="secondary">{q.category}</Badge>}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{q.summary}</p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {fmtDateTime(q.received_at)}
                      {q.company && <> · <Link href={`/companies/${q.company.id}`} className="hover:underline">{q.company.name}</Link></>}
                      {q.contact && <> · {q.contact.name}{q.contact.email ? ` <${q.contact.email}>` : ""}</>}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <InquiryStatusSelect id={q.id} status={q.status} />
                    {threadId && (
                      <Button asChild size="sm" variant="outline"><Link href={`/inbox/${threadId}`}><Mail className="size-4" /> メールを開く</Link></Button>
                    )}
                    {q.deal ? (
                      <Button asChild size="sm" variant="secondary"><Link href={`/deals/${q.deal.id}`}><KanbanSquare className="size-4" /> {q.deal.title}</Link></Button>
                    ) : (
                      <NewDealDialog
                        companies={companies ?? []}
                        contacts={contacts ?? []}
                        members={members ?? []}
                        defaults={{ company_id: q.company_id ?? undefined, contact_id: q.contact_id ?? undefined, title: q.subject, inquiry_id: q.id, email_id: q.email_id ?? undefined }}
                        trigger={<Button size="sm"><KanbanSquare className="size-4" /> 案件化</Button>}
                      />
                    )}
                  </div>
                </div>

                {latestInbound && (
                  <details className="mt-3 rounded-md border bg-muted/30 open:bg-muted/40">
                    <summary className="cursor-pointer select-none px-3 py-2 text-sm text-muted-foreground hover:text-foreground">
                      メール本文を表示{thread.length > 1 ? `(スレッド ${thread.length} 件)` : ""}
                    </summary>
                    <div className="space-y-4 border-t px-3 py-3">
                      {thread.map((e) => (
                        <div key={e.id}>
                          <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              {e.direction === "inbound" ? <ArrowDownLeft className="size-3" /> : <ArrowUpRight className="size-3" />}
                              <span className="font-medium text-foreground">{e.from_name || e.from_address}</span>
                              {e.from_name && <span>&lt;{e.from_address}&gt;</span>}
                            </span>
                            <span>{fmtDateTime(e.received_at)}</span>
                          </div>
                          <EmailBody text={e.text_body} />
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </CardContent>
            </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
