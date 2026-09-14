import Link from "next/link";
import { MessageSquareText, Mail, KanbanSquare, ArrowDownLeft, ArrowUpRight, UserRound, X } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmailBody } from "@/components/inbox/email-body";
import { NewDealDialog } from "@/components/deals/new-deal-dialog";
import { InquiryStatusSelect } from "@/components/inquiries/inquiry-status-select";
import { InquiryOwnerSelect } from "@/components/inquiries/inquiry-owner-select";
import { InquiryMemo } from "@/components/inquiries/inquiry-memo";
import { InquiryTags } from "@/components/inquiries/inquiry-tags";
import { DeleteInquiryButton } from "@/components/inquiries/delete-inquiry-button";
import { TagFilter } from "@/components/tags/tag-filter";
import { tagsFromRows } from "@/lib/tags";
import { fmtDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { INQUIRY_STATUS_LABEL, type Inquiry, type InquiryStatus, type Tag } from "@/lib/types";

export const metadata = { title: "問い合わせ" };

export default async function InquiriesPage({ searchParams }: PageProps<"/inquiries">) {
  const sp = await searchParams;
  const status = typeof sp.status === "string" ? sp.status : "open";
  const focus = typeof sp.focus === "string" ? sp.focus : null;
  const tagId = typeof sp.tag === "string" && sp.tag ? sp.tag : null;
  // 担当者の絞り込み: "none" は未割当、それ以外は members.id
  const owner = typeof sp.owner === "string" && sp.owner ? sp.owner : null;
  const supabase = await createClient();

  let query = supabase
    .from("inquiries")
    .select(
      "*, company:companies(id,name), contact:contacts(id,name,email), deal:deals!inquiries_deal_id_fkey(id,title), owner:members(id,name), memo_author:profiles(id,full_name), emails:emails!emails_inquiry_fk(id,direction,from_address,from_name,subject,text_body,received_at,tags:email_tags(tag:tags(id,name,color,sort_order,created_at)))",
    )
    .order("received_at", { ascending: false })
    .limit(200);
  if (status === "open") query = query.in("status", ["new", "in_progress"]);
  else if (status !== "all") query = query.eq("status", status);
  if (owner === "none") query = query.is("owner_id", null);
  else if (owner) query = query.eq("owner_id", owner);
  if (tagId) {
    // タグは問い合わせ自身ではなく紐付くメールに付いているので、そのタグのメールが属する問い合わせに絞る
    const { data: tagged } = await supabase.from("email_tags").select("email:emails!inner(inquiry_id)").eq("tag_id", tagId).not("email.inquiry_id", "is", null);
    const ids = new Set<string>();
    for (const r of (tagged ?? []) as unknown as { email: { inquiry_id: string | null } | { inquiry_id: string | null }[] | null }[]) {
      const e = Array.isArray(r.email) ? r.email[0] : r.email;
      if (e?.inquiry_id) ids.add(e.inquiry_id);
    }
    query = query.in("id", ids.size > 0 ? Array.from(ids) : ["00000000-0000-0000-0000-000000000000"]);
  }

  const [{ data }, { data: companies }, { data: contacts }, { data: members }, { data: tagRows }] = await Promise.all([
    query,
    supabase.from("companies").select("id, name").order("name"),
    supabase.from("contacts").select("id, name, company_id").order("name"),
    supabase.from("members").select("id, name").eq("is_active", true).order("sort_order").order("created_at"),
    supabase.from("tags").select("*").order("sort_order").order("created_at"),
  ]);
  const rows = (data ?? []) as unknown as Inquiry[];
  const allTags = (tagRows ?? []) as Tag[];
  const memberList = members ?? [];

  const hrefFor = (o: { status?: string; tag?: string | null; owner?: string | null }) => {
    const p = new URLSearchParams();
    p.set("status", o.status ?? status);
    const t = o.tag === undefined ? tagId : o.tag;
    const w = o.owner === undefined ? owner : o.owner;
    if (t) p.set("tag", t);
    if (w) p.set("owner", w);
    return `/inquiries?${p.toString()}`;
  };

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
            <Link href={hrefFor({ status: t.key })}>{t.label}</Link>
          </Button>
        ))}
      </div>
      {memberList.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5 text-sm">
          <UserRound className="size-4 text-muted-foreground" />
          <span className="mr-1 text-muted-foreground">担当者:</span>
          {[{ id: "none", name: "未割当" }, ...memberList].map((m) => (
            <Button key={m.id} asChild size="sm" variant={owner === m.id ? "secondary" : "ghost"} className="h-7 px-2">
              <Link href={hrefFor({ owner: owner === m.id ? null : m.id })}>{m.name}</Link>
            </Button>
          ))}
          {owner && (
            <Link href={hrefFor({ owner: null })} className="ml-1 inline-flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground"><X className="size-3" /> 解除</Link>
          )}
        </div>
      )}
      <TagFilter tags={allTags} active={tagId} hrefFor={(id) => hrefFor({ tag: id })} />

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
            // タグはスレッド内のメールに付いているものをまとめて出す(重複は除く)
            const threadTags: Tag[] = [];
            for (const e of thread) for (const t of tagsFromRows(e.tags)) if (!threadTags.some((x) => x.id === t.id)) threadTags.push(t);
            threadTags.sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, "ja"));
            return (
            <Card key={q.id} id={q.id} className={cn("scroll-mt-4", focus === q.id && "ring-2 ring-primary")}>
              <CardContent className="pt-0">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-medium">
                        {threadId ? <Link href={`/inbox/${threadId}`} className="hover:underline">{q.subject}</Link> : q.subject}
                      </h3>
                      {q.category && <Badge variant="secondary">{q.category}</Badge>}
                      <InquiryTags emailIds={thread.map((e) => e.id)} tags={allTags} current={threadTags} />
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{q.summary}</p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {fmtDateTime(q.received_at)}
                      {q.company && <> · <Link href={`/companies/${q.company.id}`} className="hover:underline">{q.company.name}</Link></>}
                      {q.contact && <> · {q.contact.name}{q.contact.email ? ` <${q.contact.email}>` : ""}</>}
                    </p>
                    <InquiryMemo id={q.id} memo={q.memo} updatedAt={q.memo_updated_at} updatedBy={q.memo_author?.full_name ?? null} />
                  </div>
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <InquiryOwnerSelect id={q.id} ownerId={q.owner_id} members={memberList} />
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
                        defaults={{ company_id: q.company_id ?? undefined, contact_id: q.contact_id ?? undefined, title: q.subject, inquiry_id: q.id, email_id: q.email_id ?? undefined, owner_id: q.owner_id ?? undefined, memo: q.memo ?? undefined }}
                        trigger={<Button size="sm"><KanbanSquare className="size-4" /> 案件化</Button>}
                      />
                    )}
                    <DeleteInquiryButton id={q.id} subject={q.subject} hasDeal={Boolean(q.deal)} />
                  </div>
                </div>

                {latestInbound && (
                  <details className="mt-3 rounded-md border bg-muted/30 open:bg-muted/40">
                    <summary className="cursor-pointer select-none px-3 py-2 text-sm text-muted-foreground hover:text-foreground">
                      メール本文を表示
                      {thread.length > 1 ? `(${q.contact?.name ?? latestInbound.from_name ?? latestInbound.from_address} とのやり取り ${thread.length} 件)` : ""}
                    </summary>
                    {/* 本文は高さを固定してスクロールさせ、下に続く別の問い合わせカードと混ざって見えないようにする */}
                    <div className="max-h-[28rem] space-y-3 overflow-y-auto border-t px-3 py-3">
                      {thread.map((e) => (
                        <div key={e.id} className="rounded-md border bg-card px-3 py-2">
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
                    {threadId && (
                      <div className="border-t px-3 py-2 text-xs">
                        <Link href={`/inbox/${threadId}`} className="text-muted-foreground hover:text-foreground hover:underline">
                          この問い合わせのメールをメール画面で開く →
                        </Link>
                      </div>
                    )}
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
