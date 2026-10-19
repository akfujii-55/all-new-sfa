import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Building2, User, Clock, KanbanSquare, Mail, ExternalLink, UserCog } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getFeatures } from "@/lib/features-server";
import { markEmailRead } from "@/actions/emails";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmailBody } from "@/components/inbox/email-body";
import { AttachmentList } from "@/components/inbox/attachment-list";
import { ReplyForm } from "@/components/inbox/reply-form";
import { ThreadMessage } from "@/components/inbox/thread-message";
import { NewDealDialog } from "@/components/deals/new-deal-dialog";
import { DealActivities } from "@/components/deals/activities";
import { InquiryStatusSelect } from "@/components/inquiries/inquiry-status-select";
import { InquiryOwnerSelect } from "@/components/inquiries/inquiry-owner-select";
import { InquiryMemo } from "@/components/inquiries/inquiry-memo";
import { InquiryTags } from "@/components/inquiries/inquiry-tags";
import { DeleteInquiryButton } from "@/components/inquiries/delete-inquiry-button";
import { getMailAccountOptions } from "@/lib/mail/options";
import { buildReplyContext } from "@/lib/mail/reply-context";
import { dueState } from "@/lib/activities";
import { tagsFromRows } from "@/lib/tags";
import { fmtDateTime } from "@/lib/format";
import { INQUIRY_STATUS_LABEL, type DealActivity, type Email, type Inquiry, type Tag } from "@/lib/types";

export const metadata = { title: "問い合わせ" };

/**
 * 問い合わせ 1 件の詳細。案件詳細と同じく、ここに居るかぎりメニューは「問い合わせ」のまま。
 * 上に件名・取引先・担当者・ステータス・案件化、下にタブ「メール」(やり取りと返信)「メモ」「行動(Todo)」。
 * 添付の確認・タグ・担当者や取引先の付け替えなど詳しい操作はメールのスレッド画面で行う(「メール画面で開く」)。
 */
export default async function InquiryDetailPage({ params }: PageProps<"/inquiries/[id]">) {
  const { id } = await params;
  const supabase = await createClient();
  // メール管理の利用タイプでは案件化(ボタン・案件へのリンク)を出さない
  const { sales } = await getFeatures();
  const [{ data }, { data: auth }] = await Promise.all([
    supabase
      .from("inquiries")
      .select(
        "*, company:companies(id,name), contact:contacts(id,name,email), deal:deals!inquiries_deal_id_fkey(id,title), owner:members(id,name), memo_author:profiles(id,full_name), activities:deal_activities!deal_activities_inquiry_id_fkey(*, author:profiles(id,full_name), owner:members(id,name), kind:activity_kinds(id,name,icon))",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase.auth.getUser(),
  ]);
  if (!data) notFound();
  const inq = data as unknown as Inquiry;

  // この問い合わせのメール: 紐付くメール(スレッド内の全メールに inquiry_id が付く)と、同じスレッドのメール
  const { data: linkedRows } = await supabase.from("emails").select("thread_key").eq("inquiry_id", id);
  const threadKeys = Array.from(new Set((linkedRows ?? []).map((r) => r.thread_key as string)));
  if (threadKeys.length === 0 && inq.email_id) {
    const { data: seed } = await supabase.from("emails").select("thread_key").eq("id", inq.email_id).maybeSingle();
    if (seed) threadKeys.push(seed.thread_key as string);
  }
  const { data: mailRows } =
    threadKeys.length > 0
      ? await supabase
          .from("emails")
          .select("*, attachments:email_attachments(*), tags:email_tags(tag:tags(id,name,color,sort_order,created_at))")
          .in("thread_key", threadKeys)
          .order("received_at", { ascending: true })
      : { data: [] };
  const emails = (mailRows ?? []) as unknown as (Email & { tags?: { tag: Tag | Tag[] | null }[] })[];
  const threadTags: Tag[] = [];
  for (const e of emails) for (const t of tagsFromRows(e.tags)) if (!threadTags.some((x) => x.id === t.id)) threadTags.push(t);
  threadTags.sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, "ja"));
  // 問い合わせからメールを読んだときも既読にする
  await Promise.all(emails.filter((e) => !e.is_read).map((e) => markEmailRead(e.id)));

  const [{ data: companies }, { data: contacts }, { data: members }, { data: tagRows }, { data: kindRows }, accounts] = await Promise.all([
    supabase.from("companies").select("id, name").order("name"),
    supabase.from("contacts").select("id, name, company_id, email").order("name"),
    supabase.from("members").select("id, name, profile_id").eq("is_active", true).order("sort_order").order("created_at"),
    supabase.from("tags").select("*").order("sort_order").order("created_at"),
    supabase.from("activity_kinds").select("id, name, icon").order("sort_order").order("created_at"),
    getMailAccountOptions(supabase),
  ]);
  const memberList = (members ?? []).map((m) => ({ id: m.id as string, name: m.name as string }));
  const myMemberId = (members ?? []).find((m) => m.profile_id === auth.user?.id)?.id ?? null;

  const latest = emails[emails.length - 1] ?? null;
  const reply = latest
    ? buildReplyContext(emails, {
        selfAddresses: accounts.map((a) => a.email),
        contacts: contacts ?? [],
        companyName: inq.company?.name ?? null,
        contactName: inq.contact?.name ?? null,
      })
    : null;

  const activities = (inq.activities ?? []) as DealActivity[];
  const openTodos = activities.filter((a) => !a.done_at);
  const overdue = openTodos.filter((a) => dueState(a) === "overdue").length;
  // 戻り先は、この問い合わせが載っている一覧(未対応・対応中ならその絞り込み、それ以外はそのステータス)
  const listStatus = inq.status === "new" || inq.status === "in_progress" ? "open" : inq.status;
  const listHref = `/inquiries?status=${listStatus}&focus=${inq.id}#${inq.id}`;

  return (
    <div>
      <Button asChild variant="ghost" size="sm" className="mb-3 -ml-2">
        <Link href={listHref}><ArrowLeft className="size-4" /> 問い合わせ一覧</Link>
      </Button>

      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 basis-full lg:basis-[60%]">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{inq.subject || "(件名なし)"}</h1>
            {inq.category && <Badge variant="secondary">{inq.category}</Badge>}
            <Badge variant="outline">{INQUIRY_STATUS_LABEL[inq.status]}</Badge>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span className="flex items-center gap-1"><Clock className="size-4" /> {fmtDateTime(inq.received_at)} 受信</span>
            {inq.company ? (
              <Link href={`/companies/${inq.company.id}`} className="flex items-center gap-1 hover:underline"><Building2 className="size-4" /> {inq.company.name}</Link>
            ) : (
              <span className="flex items-center gap-1"><Building2 className="size-4" /> 取引先未登録</span>
            )}
            {inq.contact && <span className="flex items-center gap-1"><User className="size-4" /> {inq.contact.name}{inq.contact.email ? ` <${inq.contact.email}>` : ""}</span>}
            <span className="flex items-center gap-1"><UserCog className="size-4" /> {inq.owner?.name ?? "担当未設定"}</span>
          </div>
          {inq.summary && <p className="mt-2 text-sm text-muted-foreground">{inq.summary}</p>}
          <div className="mt-2">
            <InquiryTags emailIds={emails.map((e) => e.id)} tags={(tagRows ?? []) as Tag[]} current={threadTags} />
          </div>
        </div>
        <div className="flex min-w-0 flex-1 basis-full flex-wrap items-center gap-2 lg:basis-0 lg:justify-end">
          <InquiryOwnerSelect id={inq.id} ownerId={inq.owner_id} members={memberList} />
          <InquiryStatusSelect id={inq.id} status={inq.status} />
          {!sales ? null : inq.deal ? (
            <Button asChild size="sm" variant="secondary" className="max-w-64" title={inq.deal.title}>
              <Link href={`/deals/${inq.deal.id}`}><KanbanSquare className="size-4" /> <span className="min-w-0 truncate">{inq.deal.title}</span></Link>
            </Button>
          ) : (
            <NewDealDialog
              companies={companies ?? []}
              contacts={(contacts ?? []).map((c) => ({ id: c.id as string, name: c.name as string, company_id: c.company_id as string | null }))}
              members={memberList}
              defaults={{ company_id: inq.company_id ?? undefined, contact_id: inq.contact_id ?? undefined, title: inq.subject, inquiry_id: inq.id, email_id: inq.email_id ?? undefined, owner_id: inq.owner_id ?? undefined, memo: inq.memo ?? undefined }}
              trigger={<Button size="sm"><KanbanSquare className="size-4" /> 案件化</Button>}
            />
          )}
          <DeleteInquiryButton id={inq.id} subject={inq.subject} hasDeal={sales && Boolean(inq.deal)} redirectTo="/inquiries" />
        </div>
      </div>

      <Tabs defaultValue="emails">
        <TabsList>
          <TabsTrigger value="emails">メール <Badge variant="secondary" className="ml-1.5 h-5 px-1.5">{emails.length}</Badge></TabsTrigger>
          <TabsTrigger value="memo">メモ{inq.memo && <span className="ml-1.5 size-1.5 rounded-full bg-primary" aria-label="メモあり" />}</TabsTrigger>
          <TabsTrigger value="activities">
            行動(Todo)
            <Badge variant={overdue > 0 ? "destructive" : "secondary"} className="ml-1.5 h-5 px-1.5">{overdue > 0 ? `超過 ${overdue}` : openTodos.length}</Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="emails" className="mt-4 space-y-4">
          {latest && reply ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <p className="text-muted-foreground">
                  {reply.latestInbound.from_name || reply.latestInbound.from_address} とのやり取り {emails.length} 件。返信はここから送れます。
                </p>
                <Button asChild size="sm" variant="outline">
                  <Link href={`/inbox/${latest.id}`}><Mail className="size-4" /> メール画面で開く <ExternalLink className="size-3.5 text-muted-foreground" /></Link>
                </Button>
              </div>
              <ReplyForm
                replyToEmailId={latest.id}
                to={reply.replyTo}
                cc={reply.replyCc}
                quote={reply.quote}
                accounts={accounts}
                defaultAccountId={reply.threadAccountId}
                merge={reply.merge}
                addressOptions={reply.addressOptions}
              />
              {/* 履歴は新しいものが上。各メールはヘッダーをクリックして開閉できる */}
              {[...emails].reverse().map((e, i) => (
                <ThreadMessage
                  key={e.id}
                  direction={e.direction}
                  fromName={e.from_name}
                  fromAddress={e.from_address}
                  to={e.to_addresses}
                  cc={e.cc_addresses}
                  receivedAt={fmtDateTime(e.received_at)}
                  snippet={e.snippet}
                  attachmentCount={e.attachments?.length ?? 0}
                  defaultOpen={i === 0}
                >
                  <EmailBody text={e.text_body} />
                  <AttachmentList attachments={e.attachments ?? []} />
                </ThreadMessage>
              ))}
            </>
          ) : (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              <Mail className="mx-auto mb-2 size-6" />
              この問い合わせに紐付いたメールはありません(元のメールが削除された可能性があります)。
            </div>
          )}
        </TabsContent>

        <TabsContent value="memo" className="mt-4">
          <Card>
            <CardContent className="pt-0">
              <p className="mb-1 text-sm text-muted-foreground">電話した、折り返し待ち、といった対応の経過を残します。案件化すると案件のメモに引き継がれます。</p>
              <InquiryMemo id={inq.id} memo={inq.memo} updatedAt={inq.memo_updated_at} updatedBy={inq.memo_author?.full_name ?? null} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="activities" className="mt-4">
          <Card>
            <CardContent className="pt-0">
              <DealActivities
                inquiryId={inq.id}
                inquiry={{ id: inq.id, subject: inq.subject, company: inq.company ?? null }}
                activities={activities}
                kinds={kindRows ?? []}
                members={memberList}
                defaultOwnerId={inq.owner_id ?? myMemberId}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
