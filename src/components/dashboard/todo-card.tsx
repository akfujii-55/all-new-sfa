import Link from "next/link";
import { AlertTriangle, ArrowRight, CalendarClock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ActivityRow } from "@/components/deals/activity-row";
import { dueState } from "@/lib/activities";
import type { DealActivity, Member } from "@/lib/types";

/** ダッシュボードの「今日やること」の読み込み列(案件・問い合わせのどちらの行動も出す) */
export const TODO_SELECT =
  "*, kind:activity_kinds(id,name,icon), owner:members(id,name), deal:deals(id,title,stage,company:companies(id,name)), inquiry:inquiries!deal_activities_inquiry_id_fkey(id,subject,company:companies(id,name))";

/** 「今日やること」: 期限超過と 7 日以内の未完了の行動。営業支援・メール管理のどちらの利用タイプでも出す */
export function TodoCard({ todos, members, emptyText }: { todos: DealActivity[]; members: Pick<Member, "id" | "name">[]; emptyText: string }) {
  const overdueCount = todos.filter((a) => dueState(a) === "overdue").length;
  return (
    <Card className={`mt-6 ${overdueCount > 0 ? "border-rose-300 dark:border-rose-900" : ""}`}>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarClock className="size-4 text-brand-ink" /> 今日やること
          {overdueCount > 0 && <Badge variant="destructive" className="h-5 px-1.5"><AlertTriangle className="mr-1 size-3" /> 期限超過 {overdueCount}</Badge>}
        </CardTitle>
        <Button asChild variant="ghost" size="sm">
          <Link href="/activities">行動の一覧 <ArrowRight className="size-4" /></Link>
        </Button>
      </CardHeader>
      <CardContent className="divide-y">
        {todos.length ? (
          todos.slice(0, 8).map((a) => <ActivityRow key={a.id} activity={a} members={members} />)
        ) : (
          <p className="text-sm text-muted-foreground">{emptyText}</p>
        )}
        {todos.length > 8 && (
          <p className="pt-2.5 text-xs text-muted-foreground">ほか {todos.length - 8} 件。<Link href="/activities" className="underline">行動の一覧</Link>で確認できます。</p>
        )}
      </CardContent>
    </Card>
  );
}
