import Link from "next/link";
import { Inbox, KanbanSquare, JapaneseYen, TrendingUp, ArrowRight, AlertTriangle, CalendarClock } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { RevenueChart } from "@/components/dashboard/revenue-chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { yen, fmtRelative, fmtDateTime, monthStart } from "@/lib/format";
import { ACTIVITY_KIND_LABEL, DEAL_STAGES, type DealActivity, type Email, type Inquiry } from "@/lib/types";
import { daysAhead, dueState, sortActivities } from "@/lib/activities";
import { ActivityKindIcon } from "@/components/deals/activity-kind-icon";
import { monthlyRevenueSeries } from "@/lib/queries/dashboard";

export const metadata = { title: "ダッシュボード" };

export default async function DashboardPage() {
  const supabase = await createClient();
  const thisMonth = monthStart();

  const weekAhead = daysAhead(7);
  const [openDeals, monthRev, newInq, unread, series, recentInq, recentMail, byStage, upcoming] = await Promise.all([
    supabase.from("deals").select("amount, probability").not("stage", "in", '("won","lost")'),
    supabase.from("revenues").select("amount").eq("year_month", thisMonth),
    supabase.from("inquiries").select("id", { count: "exact", head: true }).eq("status", "new"),
    supabase.from("emails").select("id", { count: "exact", head: true }).eq("is_read", false).eq("direction", "inbound"),
    monthlyRevenueSeries(supabase, 12),
    supabase
      .from("inquiries")
      .select("*, company:companies(id,name), contact:contacts(id,name,email)")
      .order("received_at", { ascending: false })
      .limit(5),
    supabase
      .from("emails")
      .select("id, subject, from_name, from_address, snippet, received_at, is_read, direction, company:companies(id,name)")
      .eq("direction", "inbound")
      .order("received_at", { ascending: false })
      .limit(5),
    supabase.from("deals").select("id, stage, amount").not("stage", "in", '("won","lost")'),
    // 期限超過と 7 日以内の未完了の行動
    supabase
      .from("deal_activities")
      .select("*, deal:deals(id,title)")
      .is("done_at", null)
      .not("due_at", "is", null)
      .lte("due_at", weekAhead)
      .order("due_at")
      .limit(30),
  ]);
  const todos = sortActivities((upcoming.data ?? []) as unknown as DealActivity[]);
  const overdueCount = todos.filter((a) => dueState(a) === "overdue").length;

  const pipeline = (openDeals.data ?? []).reduce((a, d) => a + Number(d.amount), 0);
  const weighted = (openDeals.data ?? []).reduce((a, d) => a + (Number(d.amount) * Number(d.probability)) / 100, 0);
  const monthTotal = (monthRev.data ?? []).reduce((a, r) => a + Number(r.amount), 0);

  const stageAgg = DEAL_STAGES.filter((s) => s.key !== "won" && s.key !== "lost").map((s) => {
    const rows = (byStage.data ?? []).filter((d) => d.stage === s.key);
    return { ...s, count: rows.length, amount: rows.reduce((a, d) => a + Number(d.amount), 0) };
  });
  const maxStage = Math.max(1, ...stageAgg.map((s) => s.amount));

  return (
    <div>
      <PageHeader title="ダッシュボード" description="営業活動の全体像" />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="今月の売上計上" value={yen(monthTotal)} icon={JapaneseYen} />
        <StatCard label="パイプライン総額" value={yen(pipeline)} hint={`確度加重 ${yen(weighted)}`} icon={TrendingUp} />
        <StatCard label="進行中の案件" value={`${openDeals.data?.length ?? 0} 件`} hint={overdueCount > 0 ? `期限超過の行動 ${overdueCount} 件` : "期限超過の行動なし"} icon={KanbanSquare} />
        <StatCard label="新規問い合わせ" value={`${newInq.count ?? 0} 件`} hint={`未読メール ${unread.count ?? 0} 件`} icon={Inbox} />
      </div>

      <Card className={`mt-6 ${overdueCount > 0 ? "border-rose-300 dark:border-rose-900" : ""}`}>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarClock className="size-4" /> 行動の予定(期限超過と 7 日以内)
            {overdueCount > 0 && <Badge variant="destructive" className="h-5 px-1.5"><AlertTriangle className="mr-1 size-3" /> 期限超過 {overdueCount}</Badge>}
          </CardTitle>
          <Button asChild variant="ghost" size="sm">
            <Link href="/deals">案件 <ArrowRight className="size-4" /></Link>
          </Button>
        </CardHeader>
        <CardContent className="divide-y">
          {todos.length ? (
            todos.slice(0, 10).map((a) => {
              const st = dueState(a);
              return (
                <div key={a.id} className="flex items-start justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <Link href={`/deals/${a.deal_id}`} className="text-sm font-medium hover:underline line-clamp-1">
                      <ActivityKindIcon kind={a.kind} className="mr-1 inline size-3.5 align-[-2px]" />
                      {a.deal?.title ?? "案件"}
                    </Link>
                    <p className="text-xs text-muted-foreground line-clamp-1">{ACTIVITY_KIND_LABEL[a.kind]} · {a.body}</p>
                  </div>
                  <div className="shrink-0 text-right text-xs">
                    <p className={st === "overdue" ? "font-medium text-rose-600 dark:text-rose-300" : st === "today" ? "font-medium text-amber-600 dark:text-amber-300" : "text-muted-foreground"}>
                      {st === "overdue" ? "期限超過" : st === "today" ? "今日" : "予定"}
                    </p>
                    <p className="text-muted-foreground">{fmtDateTime(a.due_at)}</p>
                  </div>
                </div>
              );
            })
          ) : (
            <p className="text-sm text-muted-foreground">期限が近い行動はありません。案件の「行動」タブから期限付きの Todo を登録できます。</p>
          )}
        </CardContent>
      </Card>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">月次売上(直近12ヶ月)</CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link href="/revenue">
                詳細 <ArrowRight className="size-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            <RevenueChart data={series} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">ステージ別パイプライン</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {stageAgg.map((s) => (
              <div key={s.key}>
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <span className={`size-2 rounded-full ${s.color}`} />
                    {s.label}
                    <span className="text-muted-foreground">{s.count}件</span>
                  </span>
                  <span className="tabular-nums">{yen(s.amount)}</span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-muted">
                  <div className={`h-1.5 rounded-full ${s.color}`} style={{ width: `${(s.amount / maxStage) * 100}%` }} />
                </div>
              </div>
            ))}
            <Button asChild variant="outline" size="sm" className="w-full mt-2">
              <Link href="/deals">カンバンを開く</Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">最近の問い合わせ</CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link href="/inquiries">すべて <ArrowRight className="size-4" /></Link>
            </Button>
          </CardHeader>
          <CardContent className="divide-y">
            {(recentInq.data as unknown as Inquiry[] | null)?.length ? (
              (recentInq.data as unknown as Inquiry[]).map((q) => (
                <div key={q.id} className="flex items-start justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <Link href={`/inquiries?status=all&focus=${q.id}#${q.id}`} className="font-medium text-sm hover:underline line-clamp-1">
                      {q.subject}
                    </Link>
                    <p className="text-xs text-muted-foreground line-clamp-1">
                      {q.company?.name ?? "-"}{q.contact ? ` / ${q.contact.name}` : ""}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    {q.category && <Badge variant="secondary">{q.category}</Badge>}
                    <p className="text-xs text-muted-foreground mt-1">{fmtRelative(q.received_at)}</p>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">問い合わせはまだありません</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">最近の受信メール</CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link href="/inbox">受信トレイ <ArrowRight className="size-4" /></Link>
            </Button>
          </CardHeader>
          <CardContent className="divide-y">
            {(recentMail.data as unknown as Email[] | null)?.length ? (
              (recentMail.data as unknown as Email[]).map((m) => (
                <div key={m.id} className="flex items-start justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <Link href={`/inbox/${m.id}`} className={`text-sm hover:underline line-clamp-1 ${m.is_read ? "" : "font-semibold"}`}>
                      {m.subject || "(件名なし)"}
                    </Link>
                    <p className="text-xs text-muted-foreground line-clamp-1">{m.from_name || m.from_address}{m.company ? ` · ${m.company.name}` : ""}</p>
                  </div>
                  <p className="text-xs text-muted-foreground shrink-0">{fmtRelative(m.received_at)}</p>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                メールはまだありません。右上の「メール同期」で連携したメールアカウントから取り込みます。
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

