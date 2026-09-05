import Link from "next/link";
import { MessageSquareText, Mail, KanbanSquare } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { NewDealDialog } from "@/components/deals/new-deal-dialog";
import { InquiryStatusSelect } from "@/components/inquiries/inquiry-status-select";
import { MailSyncButton } from "@/components/inbox/mail-sync-button";
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
    .select("*, company:companies(id,name), contact:contacts(id,name,email), deal:deals(id,title)")
    .order("received_at", { ascending: false })
    .limit(200);
  if (status === "open") query = query.in("status", ["new", "in_progress"]);
  else if (status !== "all") query = query.eq("status", status);

  const [{ data }, { data: companies }, { data: contacts }] = await Promise.all([
    query,
    supabase.from("companies").select("id, name").order("name"),
    supabase.from("contacts").select("id, name, company_id").order("name"),
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
        description="受信メールから自動抽出された問い合わせ。アポイントが取れたら案件化します。"
        actions={<MailSyncButton />}
      />
      <div className="mb-4 flex flex-wrap gap-2">
        {tabs.map((t) => (
          <Button key={t.key} asChild size="sm" variant={status === t.key ? "default" : "outline"}>
            <Link href={`/inquiries?status=${t.key}`}>{t.label}</Link>
          </Button>
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={MessageSquareText} title="問い合わせがありません" description="メールを同期すると、新規スレッドの受信メールが問い合わせとして登録されます。" />
      ) : (
        <div className="space-y-3">
          {rows.map((q) => (
            <Card key={q.id} id={q.id} className={cn(focus === q.id && "ring-2 ring-primary")}>
              <CardContent className="pt-0">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-medium">{q.subject}</h3>
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
                    {q.email_id && (
                      <Button asChild size="sm" variant="outline"><Link href={`/inbox/${q.email_id}`}><Mail className="size-4" /> メール</Link></Button>
                    )}
                    {q.deal ? (
                      <Button asChild size="sm" variant="secondary"><Link href={`/deals/${q.deal.id}`}><KanbanSquare className="size-4" /> {q.deal.title}</Link></Button>
                    ) : (
                      <NewDealDialog
                        companies={companies ?? []}
                        contacts={contacts ?? []}
                        defaults={{ company_id: q.company_id ?? undefined, contact_id: q.contact_id ?? undefined, title: q.subject, inquiry_id: q.id, email_id: q.email_id ?? undefined }}
                        trigger={<Button size="sm"><KanbanSquare className="size-4" /> 案件化</Button>}
                      />
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
