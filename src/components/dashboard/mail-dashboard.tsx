import Link from "next/link";
import { ArrowRight, Inbox, Mail, MessageSquareText, MessagesSquare, UserRound, UserRoundX } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { NotificationsCard } from "@/components/dashboard/notifications-card";
import { RecentLists } from "@/components/dashboard/recent-lists";
import { TodoCard, TODO_SELECT } from "@/components/dashboard/todo-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getMailAccountOptions } from "@/lib/mail/options";
import { inboxHref } from "@/lib/inbox-filters";
import { daysAhead, sortActivities } from "@/lib/activities";
import type { DealActivity, Email, Inquiry, Notification } from "@/lib/types";

/**
 * メール管理の利用タイプ(tenants.usage_type = mail)のダッシュボード。
 * 売上・パイプラインは出さず、今日やること(問い合わせの Todo)、メールアカウントごとの未読、問い合わせの対応状況(担当者別)を見せる
 */
export async function MailDashboard() {
  const supabase = await createClient();
  const [accounts, unread, openInq, recentInq, recentMail, memberRows, unreadNotes, upcoming] = await Promise.all([
    getMailAccountOptions(supabase),
    supabase.from("emails").select("id", { count: "exact", head: true }).eq("is_read", false).eq("direction", "inbound"),
    // 未対応・対応中の問い合わせ(状態と担当者だけ読んで画面側で数える)
    supabase.from("inquiries").select("id, status, owner_id").in("status", ["new", "in_progress"]).limit(1000),
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
    supabase.from("members").select("id, name").eq("is_active", true).order("sort_order").order("created_at"),
    // 自分あての未読のお知らせ(担当者に付けられた)。RLS で本人の分だけ見える
    supabase.from("notifications").select("*").is("read_at", null).order("created_at", { ascending: false }).limit(20),
    // 期限超過と 7 日以内の未完了の行動(問い合わせの Todo)
    supabase.from("deal_activities").select(TODO_SELECT).is("done_at", null).not("due_at", "is", null).lte("due_at", daysAhead(7)).order("due_at").limit(30),
  ]);
  const todos = sortActivities((upcoming.data ?? []) as unknown as DealActivity[]);
  // アカウントごとの未読(アカウント数は上限があるので 1 件ずつ数える)
  const unreadByAccount = await Promise.all(
    accounts.map(async (a) => {
      const { count } = await supabase.from("emails").select("id", { count: "exact", head: true }).eq("is_read", false).eq("direction", "inbound").eq("account_id", a.id);
      return { account: a, unread: count ?? 0 };
    }),
  );

  const open = openInq.data ?? [];
  const newCount = open.filter((q) => q.status === "new").length;
  const inProgressCount = open.filter((q) => q.status === "in_progress").length;
  const unassignedCount = open.filter((q) => !q.owner_id).length;
  const members = memberRows.data ?? [];
  const byOwner = members
    .map((m) => {
      const mine = open.filter((q) => q.owner_id === m.id);
      return { ...m, total: mine.length, fresh: mine.filter((q) => q.status === "new").length };
    })
    .filter((m) => m.total > 0 || members.length <= 8);

  return (
    <div>
      <PageHeader title="ダッシュボード" description="メールと問い合わせの対応状況" />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="未読メール" value={`${unread.count ?? 0} 件`} hint={`連携メールアカウント ${accounts.length} 件`} icon={Inbox} />
        <StatCard label="新規の問い合わせ" value={`${newCount} 件`} hint="まだ対応を始めていない" icon={MessageSquareText} />
        <StatCard label="対応中の問い合わせ" value={`${inProgressCount} 件`} icon={MessagesSquare} />
        <StatCard label="担当者が未割当" value={`${unassignedCount} 件`} hint="未対応・対応中のうち" icon={UserRoundX} />
      </div>

      <NotificationsCard notifications={(unreadNotes.data ?? []) as Notification[]} />

      <TodoCard todos={todos} members={members} emptyText="期限超過や 7 日以内の行動はありません。問い合わせのカードの「行動(Todo)を追加」から期限付きの Todo を登録できます。" />

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base"><Mail className="size-4" /> メールアカウント別の未読</CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link href={inboxHref({ filter: "unread", q: "", target: "all", tagId: null, accountId: null })}>未読をすべて <ArrowRight className="size-4" /></Link>
            </Button>
          </CardHeader>
          <CardContent className="divide-y">
            {unreadByAccount.length ? (
              unreadByAccount.map(({ account, unread: n }) => (
                <Link
                  key={account.id}
                  href={inboxHref({ filter: n > 0 ? "unread" : "all", q: "", target: "all", tagId: null, accountId: account.id })}
                  className="-mx-2 flex items-center justify-between gap-3 rounded px-2 py-2.5 hover:bg-accent/40"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{account.label || account.email}</p>
                    {account.label && <p className="truncate text-xs text-muted-foreground">{account.email}</p>}
                  </div>
                  {n > 0 ? <Badge className="h-5 shrink-0 px-1.5 tabular-nums">未読 {n}</Badge> : <span className="shrink-0 text-xs text-muted-foreground">未読なし</span>}
                </Link>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                メールアカウントがまだ連携されていません。<Link href="/settings" className="underline">設定</Link>から追加してください。
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base"><UserRound className="size-4" /> 担当者別の問い合わせ(未対応・対応中)</CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link href="/inquiries">問い合わせ <ArrowRight className="size-4" /></Link>
            </Button>
          </CardHeader>
          <CardContent className="divide-y">
            <Link href="/inquiries?status=open&owner=none" className="-mx-2 flex items-center justify-between gap-3 rounded px-2 py-2.5 hover:bg-accent/40">
              <span className="text-sm font-medium">未割当</span>
              {unassignedCount > 0 ? <Badge variant="destructive" className="h-5 px-1.5 tabular-nums">{unassignedCount} 件</Badge> : <span className="text-xs text-muted-foreground">なし</span>}
            </Link>
            {byOwner.map((m) => (
              <Link key={m.id} href={`/inquiries?status=open&owner=${m.id}`} className="-mx-2 flex items-center justify-between gap-3 rounded px-2 py-2.5 hover:bg-accent/40">
                <span className="truncate text-sm font-medium">{m.name}</span>
                <span className="flex shrink-0 items-center gap-2 text-sm tabular-nums">
                  {m.fresh > 0 && <Badge variant="secondary" className="h-5 px-1.5">新規 {m.fresh}</Badge>}
                  {m.total > 0 ? `${m.total} 件` : <span className="text-xs text-muted-foreground">なし</span>}
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>

      <RecentLists inquiries={(recentInq.data ?? []) as unknown as Inquiry[]} mails={(recentMail.data ?? []) as unknown as Email[]} />
    </div>
  );
}
