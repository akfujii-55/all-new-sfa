import Link from "next/link";
import { Inbox, KanbanSquare, JapaneseYen, TrendingUp, ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { NotificationsCard } from "@/components/dashboard/notifications-card";
import { RevenueChart } from "@/components/dashboard/revenue-chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { yen, monthStart } from "@/lib/format";
import { DEAL_STAGES, type DealActivity, type Email, type Inquiry, type Notification } from "@/lib/types";
import { daysAhead, dueState, sortActivities } from "@/lib/activities";
import { monthlyRevenueSeries } from "@/lib/queries/dashboard";
import { RecentLists } from "@/components/dashboard/recent-lists";
import { TodoCard, TODO_SELECT } from "@/components/dashboard/todo-card";
import { MailDashboard } from "@/components/dashboard/mail-dashboard";
import { getFeatures } from "@/lib/features-server";

export const metadata = { title: "ダッシュボード" };

export default async function DashboardPage() {
  // メール管理の利用タイプは売上・パイプラインを出さない専用のダッシュボード
  if (!(await getFeatures()).sales) return <MailDashboard />;
  const supabase = await createClient();
  const thisMonth = monthStart();

  const weekAhead = daysAhead(7);
  const [openDeals, monthRev, newInq, unread, series, recentInq, recentMail, byStage, upcoming, memberRows, unreadNotes] = await Promise.all([
    supabase.from("deals").select("amount, probability").not("stage", "in", '("won","lost")'),
    supabase.from("revenues").select("amount").eq("year_month", thisMonth),
    supabase.from("inquiries").select("id", { count: "exact", head: true }).eq("status", "new"),
    supabase.from("emails").select("id", { count: "exact", head: true }).eq("is_read", false).eq("direction", "inbound"),
    monthlyRevenueSeries(supabase, 12),
    supabase
      .from("inquiries")
      .select("*, company:companies(id,name), contact:contacts(id,name,email), owner:members(id,name)")
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
      .select(TODO_SELECT)
      .is("done_at", null)
      .not("due_at", "is", null)
      .lte("due_at", weekAhead)
      .order("due_at")
      .limit(30),
    // 行動の担当者の付け替え用(在籍中の営業担当者)
    supabase.from("members").select("id, name").eq("is_active", true).order("sort_order").order("created_at"),
    // 自分あての未読のお知らせ(担当者に付けられた)。RLS で本人の分だけ見える
    supabase.from("notifications").select("*").is("read_at", null).order("created_at", { ascending: false }).limit(20),
  ]);
  const members = memberRows.data ?? [];
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

      <NotificationsCard notifications={(unreadNotes.data ?? []) as Notification[]} />

      <TodoCard todos={todos} members={members} emptyText="期限超過や 7 日以内の行動はありません。案件の「行動」タブや問い合わせのカードから期限付きの Todo を登録できます。" />

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

      <RecentLists inquiries={(recentInq.data ?? []) as unknown as Inquiry[]} mails={(recentMail.data ?? []) as unknown as Email[]} />
    </div>
  );
}

