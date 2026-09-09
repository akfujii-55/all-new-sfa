import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Building2, User, UserCog, CalendarClock, Mail, PenSquare } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StageSelect } from "@/components/deals/stage-select";
import { DealEditDialog } from "@/components/deals/deal-edit-dialog";
import { DealNotes } from "@/components/deals/notes";
import { RevenueEditor } from "@/components/deals/revenue-editor";
import { EmailBody } from "@/components/inbox/email-body";
import { AttachmentList } from "@/components/inbox/attachment-list";
import { ComposeDialog } from "@/components/inbox/compose-dialog";
import { fmtDate, fmtDateTime, fmtMonth, yen } from "@/lib/format";
import { getMailAccountOptions } from "@/lib/mail/options";
import type { Deal, DealNote, Email, Revenue } from "@/lib/types";
import { cn } from "@/lib/utils";

export default async function DealDetailPage({ params }: PageProps<"/deals/[id]">) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("deals")
    .select("*, company:companies(id,name), contact:contacts(id,name,email), owner:members(id,name)")
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();
  const deal = data as unknown as Deal;

  const [{ data: emails }, { data: notes }, { data: revenues }, { data: contacts }, { data: members }, accounts] = await Promise.all([
    supabase.from("emails").select("*, attachments:email_attachments(*)").eq("deal_id", id).order("received_at", { ascending: false }),
    supabase.from("deal_notes").select("*, author:profiles(id,full_name)").eq("deal_id", id).order("created_at", { ascending: false }),
    supabase.from("revenues").select("*").eq("deal_id", id).order("year_month"),
    supabase.from("contacts").select("id, name").eq("company_id", deal.company_id).order("name"),
    supabase.from("members").select("id, name, is_active").order("sort_order").order("created_at"),
    getMailAccountOptions(supabase),
  ]);
  const memberOptions = (members ?? []).filter((m) => m.is_active || m.id === deal.owner_id);

  const revTotal = (revenues ?? []).reduce((a, r) => a + Number(r.amount), 0);

  return (
    <div>
      <Button asChild variant="ghost" size="sm" className="mb-3 -ml-2">
        <Link href="/deals"><ArrowLeft className="size-4" /> 案件一覧</Link>
      </Button>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{deal.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <Link href={`/companies/${deal.company_id}`} className="flex items-center gap-1 hover:underline"><Building2 className="size-4" /> {deal.company?.name}</Link>
            {deal.contact && <span className="flex items-center gap-1"><User className="size-4" /> {deal.contact.name}</span>}
            {deal.appointment_at && <span className="flex items-center gap-1"><CalendarClock className="size-4" /> アポ {fmtDateTime(deal.appointment_at)}</span>}
            <span className="flex items-center gap-1"><UserCog className="size-4" /> {deal.owner?.name ?? "担当未設定"}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StageSelect deal={{ id: deal.id, title: deal.title, amount: Number(deal.amount), stage: deal.stage }} />
          <DealEditDialog deal={deal} contacts={contacts ?? []} members={memberOptions} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3 mb-6">
        <Card><CardContent className="pt-0"><p className="text-sm text-muted-foreground">{deal.stage === "won" ? "売上(計上済み)" : "見込み売上"}</p><p className="text-2xl font-semibold tabular-nums">{yen(deal.stage === "won" ? revTotal : deal.amount)}</p></CardContent></Card>
        <Card><CardContent className="pt-0"><p className="text-sm text-muted-foreground">確度</p><p className="text-2xl font-semibold tabular-nums">{deal.probability}%</p></CardContent></Card>
        <Card><CardContent className="pt-0"><p className="text-sm text-muted-foreground">{deal.stage === "won" ? "成約日" : "受注予定日"}</p><p className="text-2xl font-semibold tabular-nums">{deal.stage === "won" ? fmtDate(deal.won_at) : fmtDate(deal.expected_close_date)}</p></CardContent></Card>
      </div>

      {deal.stage === "lost" && deal.lost_reason && (
        <Card className="mb-6 border-rose-200 dark:border-rose-900"><CardContent className="pt-0 text-sm"><span className="font-medium">失注理由: </span>{deal.lost_reason}</CardContent></Card>
      )}
      {deal.memo && <Card className="mb-6"><CardContent className="pt-0 text-sm whitespace-pre-wrap">{deal.memo}</CardContent></Card>}

      <Tabs defaultValue="emails">
        <TabsList>
          <TabsTrigger value="emails">メール履歴 <Badge variant="secondary" className="ml-1.5 h-5 px-1.5">{emails?.length ?? 0}</Badge></TabsTrigger>
          <TabsTrigger value="notes">商談メモ <Badge variant="secondary" className="ml-1.5 h-5 px-1.5">{notes?.length ?? 0}</Badge></TabsTrigger>
          <TabsTrigger value="revenue">売上計上 <Badge variant="secondary" className="ml-1.5 h-5 px-1.5">{revenues?.length ?? 0}</Badge></TabsTrigger>
        </TabsList>

        <TabsContent value="emails" className="mt-4 space-y-3">
          <div className="flex justify-end">
            <ComposeDialog
              accounts={accounts}
              defaults={{ to: deal.contact?.email ?? "", subject: `${deal.title}について`, dealId: deal.id, contactId: deal.contact_id, companyId: deal.company_id }}
              trigger={<Button size="sm"><PenSquare className="size-4" /> メールを送る</Button>}
            />
          </div>
          {(emails as Email[] | null)?.length ? (
            (emails as Email[]).map((e) => (
              <Card key={e.id} className={cn(e.direction === "outbound" && "border-emerald-200 dark:border-emerald-900")}>
                <CardHeader className="pb-2">
                  <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                    <div>
                      <Badge variant={e.direction === "inbound" ? "secondary" : "outline"} className="mr-2">{e.direction === "inbound" ? "受信" : "送信"}</Badge>
                      <span className="font-medium">{e.from_name || e.from_address}</span>
                      <span className="text-muted-foreground"> → {e.to_addresses.join(", ")}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">{fmtDateTime(e.received_at)}</span>
                  </div>
                  <Link href={`/inbox/${e.id}`} className="text-sm font-medium hover:underline">{e.subject || "(件名なし)"}</Link>
                </CardHeader>
                <CardContent><EmailBody text={e.text_body} /><AttachmentList attachments={e.attachments ?? []} /></CardContent>
              </Card>
            ))
          ) : (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              <Mail className="mx-auto mb-2 size-6" />
              この案件に紐付いたメールはまだありません。受信トレイのスレッドから紐付けるか、ここから送信できます。
            </div>
          )}
        </TabsContent>

        <TabsContent value="notes" className="mt-4">
          <Card><CardContent className="pt-0"><DealNotes dealId={deal.id} notes={(notes ?? []) as unknown as DealNote[]} /></CardContent></Card>
        </TabsContent>

        <TabsContent value="revenue" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">月次売上計上</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {deal.stage === "won" ? (
                <RevenueEditor dealId={deal.id} revenues={(revenues ?? []) as Revenue[]} />
              ) : (
                <p className="text-sm text-muted-foreground">ステージを「成約」にすると売上計上を入力できます。</p>
              )}
              {(revenues ?? []).length > 0 && (
                <div className="rounded-md border divide-y text-sm">
                  {(revenues as Revenue[]).map((r) => (
                    <div key={r.id} className="flex items-center justify-between px-3 py-2">
                      <span>{fmtMonth(r.year_month)}{r.memo ? <span className="text-muted-foreground"> · {r.memo}</span> : null}</span>
                      <span className="tabular-nums font-medium">{yen(r.amount)}</span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between px-3 py-2 bg-muted/50 font-semibold">
                    <span>合計</span><span className="tabular-nums">{yen(revTotal)}</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
