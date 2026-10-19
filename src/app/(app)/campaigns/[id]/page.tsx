import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CampaignForm } from "@/components/campaigns/campaign-form";
import { CampaignActions } from "@/components/campaigns/campaign-actions";
import { getMailAccountOptions } from "@/lib/mail/options";
import { campaignDailyLimitOf, getCampaignSettings } from "@/lib/settings";
import { CAMPAIGN_STATUS_LABEL, RECIPIENT_STATUS_LABEL, estimateMinutes } from "@/lib/campaigns-shared";
import { fmtDateTime } from "@/lib/format";
import type { MailCampaign, MailCampaignRecipient } from "@/lib/types";
import { listMailingListsWithCounts, siteOrigin } from "../_lib";

export const metadata = { title: "配信" };

/** 配信 1 件。下書き・一時停止中は編集フォーム、それ以外は内容と宛先ごとの結果 */
export default async function CampaignDetailPage({ params }: PageProps<"/campaigns/[id]">) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("mail_campaigns").select("*, account:mail_accounts(id, email, label), list:mailing_lists(id, name)").eq("id", id).maybeSingle();
  if (!data) notFound();
  const c = data as unknown as MailCampaign;
  const editable = c.status === "draft";

  if (editable) {
    const [accounts, lists, settings] = await Promise.all([getMailAccountOptions(supabase), listMailingListsWithCounts(supabase), getCampaignSettings(supabase)]);
    return (
      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <Button asChild variant="ghost" size="sm" className="-ml-2"><Link href="/campaigns"><ArrowLeft className="size-4" /> 配信一覧</Link></Button>
          <CampaignActions id={c.id} status={c.status} />
        </div>
        <h1 className="mb-4 text-xl font-semibold tracking-tight">配信の下書き</h1>
        <CampaignForm campaign={c} accounts={accounts} lists={lists} footer={settings.campaign_footer} siteUrl={siteOrigin()} dailyLimit={campaignDailyLimitOf(settings)} />
      </div>
    );
  }

  const { data: recRows } = await supabase.from("mail_campaign_recipients").select("*").eq("campaign_id", id).order("status").order("created_at").limit(5000);
  const recipients = (recRows ?? []) as MailCampaignRecipient[];
  const pending = recipients.filter((r) => r.status === "pending").length;
  const target = c.total_count - c.skipped_count;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <Button asChild variant="ghost" size="sm" className="-ml-2"><Link href="/campaigns"><ArrowLeft className="size-4" /> 配信一覧</Link></Button>
        <CampaignActions id={c.id} status={c.status} />
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-semibold tracking-tight">{c.subject}</h1>
        <Badge variant="outline">{CAMPAIGN_STATUS_LABEL[c.status]}</Badge>
      </div>
      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <Card><CardContent className="pt-0"><p className="text-xs text-muted-foreground">送信済み</p><p className="text-2xl font-semibold tabular-nums">{c.sent_count}<span className="text-sm text-muted-foreground"> / {target}</span></p></CardContent></Card>
        <Card><CardContent className="pt-0"><p className="text-xs text-muted-foreground">未送信</p><p className="text-2xl font-semibold tabular-nums">{pending}</p>{c.status === "sending" && pending > 0 && <p className="text-xs text-muted-foreground">あと約 {estimateMinutes(pending)} 分</p>}</CardContent></Card>
        <Card><CardContent className="pt-0"><p className="text-xs text-muted-foreground">失敗</p><p className="text-2xl font-semibold tabular-nums">{c.failed_count}</p></CardContent></Card>
        <Card><CardContent className="pt-0"><p className="text-xs text-muted-foreground">除外(配信停止・アドレス無し)</p><p className="text-2xl font-semibold tabular-nums">{c.skipped_count}</p></CardContent></Card>
      </div>
      {c.last_error && (
        <div className="mb-4 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {c.last_error}
        </div>
      )}
      <div className="mb-4 grid gap-3 text-sm sm:grid-cols-2">
        <div className="rounded-md border px-3 py-2"><span className="text-muted-foreground">配信先: </span>{c.list ? <Link href={`/campaigns/lists/${c.list.id}`} className="hover:underline">{c.list.name}</Link> : c.list_name}<span className="text-muted-foreground"> ・ 送信元: </span>{c.account?.email ?? "(削除済み)"}</div>
        <div className="rounded-md border px-3 py-2 text-muted-foreground">{c.status === "scheduled" ? `${fmtDateTime(c.scheduled_at)} に送信開始予定` : c.started_at ? `${fmtDateTime(c.started_at)} 開始` : ""}{c.finished_at ? ` ・ ${fmtDateTime(c.finished_at)} ${c.status === "cancelled" ? "取り消し" : "完了"}` : ""}</div>
      </div>
      <Card className="mb-4">
        <CardContent className="pt-0">
          <p className="mb-1 text-xs text-muted-foreground">本文(差し込みは相手ごとに置き換えて送信。末尾に送信者情報と配信停止リンクが付きます)</p>
          <pre className="whitespace-pre-wrap font-sans text-sm">{c.body}</pre>
        </CardContent>
      </Card>
      <h2 className="mb-2 text-base font-medium">宛先ごとの結果</h2>
      <div className="rounded-lg border bg-card scroll-x">
        <Table className="min-w-[760px]">
          <TableHeader>
            <TableRow>
              <TableHead>氏名</TableHead>
              <TableHead>会社</TableHead>
              <TableHead>メール</TableHead>
              <TableHead>結果</TableHead>
              <TableHead>日時・理由</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {recipients.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.name || "-"}</TableCell>
                <TableCell className="text-muted-foreground">{r.company_name || "-"}</TableCell>
                <TableCell className="text-muted-foreground">{r.email.replace(/#[0-9a-f]{8}$/, "")}</TableCell>
                <TableCell>
                  <Badge variant={r.status === "sent" ? "secondary" : r.status === "failed" ? "destructive" : "outline"}>{RECIPIENT_STATUS_LABEL[r.status]}</Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{r.status === "sent" ? fmtDateTime(r.sent_at) : r.reason ?? ""}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
