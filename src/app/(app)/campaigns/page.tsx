import Link from "next/link";
import { Send, Plus, ListChecks } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CAMPAIGN_STATUS_LABEL } from "@/lib/campaigns-shared";
import { fmtDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { MailCampaign } from "@/lib/types";

export const metadata = { title: "配信" };

const STATUS_CLASS: Record<MailCampaign["status"], string> = {
  draft: "bg-muted text-muted-foreground",
  scheduled: "bg-brand-soft text-brand-ink",
  sending: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  paused: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  done: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  cancelled: "bg-muted text-muted-foreground line-through",
};

/** 一斉配信(0043)の一覧。行を押すと詳細(宛先ごとの結果・操作)へ */
export default async function CampaignsPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("mail_campaigns")
    .select("*, account:mail_accounts(id, email, label), list:mailing_lists(id, name)")
    .order("created_at", { ascending: false })
    .limit(200);
  const rows = (data ?? []) as unknown as MailCampaign[];

  return (
    <div>
      <PageHeader
        title="配信"
        description="配信リストの担当者に、自社のメールアカウントから 1 通ずつ個別に送ります。送った内容と宛先ごとの結果はここで確認します。"
        actions={
          <>
            <Button asChild size="sm" variant="outline"><Link href="/campaigns/lists"><ListChecks className="size-4" /> 配信リスト</Link></Button>
            <Button asChild size="sm"><Link href="/campaigns/new"><Plus className="size-4" /> 新しい配信</Link></Button>
          </>
        }
      />
      {rows.length === 0 ? (
        <EmptyState
          icon={Send}
          title="配信はまだありません"
          description="まず「配信リスト」で宛先のリストを作り、「新しい配信」で件名と本文を書いて送ります。"
          action={<Button asChild size="sm"><Link href="/campaigns/lists"><ListChecks className="size-4" /> 配信リストを作る</Link></Button>}
        />
      ) : (
        <div className="rounded-lg border bg-card scroll-x">
          <Table className="min-w-[860px]">
            <TableHeader>
              <TableRow>
                <TableHead>件名</TableHead>
                <TableHead>配信先</TableHead>
                <TableHead>送信元</TableHead>
                <TableHead>状態</TableHead>
                <TableHead className="text-right">送信 / 対象</TableHead>
                <TableHead>予定・開始</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((c) => {
                const target = c.total_count - c.skipped_count;
                const pct = target > 0 ? Math.round((c.sent_count / target) * 100) : 0;
                return (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium"><Link href={`/campaigns/${c.id}`} className="hover:underline">{c.subject}</Link></TableCell>
                    <TableCell>{c.list ? <Link href={`/campaigns/lists/${c.list.id}`} className="hover:underline">{c.list.name}</Link> : <span className="text-muted-foreground">{c.list_name || "(リスト未選択)"}</span>}</TableCell>
                    <TableCell className="text-muted-foreground">{c.account?.email ?? <span className="text-destructive">未選択</span>}</TableCell>
                    <TableCell>
                      <span className={cn("rounded px-1.5 py-0.5 text-xs", STATUS_CLASS[c.status])}>{CAMPAIGN_STATUS_LABEL[c.status]}</span>
                      {c.failed_count > 0 && <Badge variant="destructive" className="ml-1 h-5 px-1.5 text-xs">失敗 {c.failed_count}</Badge>}
                      {c.status === "sending" && (
                        <div className="mt-1 h-1.5 w-28 overflow-hidden rounded bg-muted"><div className="h-full bg-primary" style={{ width: `${pct}%` }} /></div>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{c.status === "draft" ? "-" : `${c.sent_count} / ${target}`}</TableCell>
                    <TableCell className="text-muted-foreground">{c.status === "scheduled" ? `${fmtDateTime(c.scheduled_at)} 予定` : c.started_at ? `${fmtDateTime(c.started_at)} 開始` : fmtDateTime(c.created_at)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
