import Link from "next/link";
import { CalendarCheck, KanbanSquare } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ActivityRow } from "@/components/deals/activity-row";
import { groupByDue } from "@/lib/activities";
import type { DealActivity } from "@/lib/types";

export const metadata = { title: "行動" };

const SELECT = "*, deal:deals(id,title,stage,company:companies(id,name))";

/** 全案件の行動(Todo)を期限の状態ごとに一覧する。完了はここからも付けられる */
export default async function ActivitiesPage({ searchParams }: PageProps<"/activities">) {
  const sp = await searchParams;
  const showDone = sp.done === "1";
  const supabase = await createClient();
  const [{ data: openRows }, { data: doneRows }] = await Promise.all([
    supabase.from("deal_activities").select(SELECT).is("done_at", null).order("due_at", { ascending: true, nullsFirst: false }).order("created_at", { ascending: false }),
    showDone
      ? supabase.from("deal_activities").select(SELECT).not("done_at", "is", null).order("done_at", { ascending: false }).limit(50)
      : Promise.resolve({ data: [] as unknown[] }),
  ]);
  const open = (openRows ?? []) as unknown as DealActivity[];
  const done = (doneRows ?? []) as unknown as DealActivity[];
  const groups = groupByDue(open);
  const overdue = groups.find((g) => g.key === "overdue")?.items.length ?? 0;

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="行動"
        description="全案件の未完了の行動(電話・メール・訪問・見積書作成・折り返し依頼などの Todo)。期限の近い順に並びます。完了したらチェックを付けてください。"
        actions={
          <div className="flex items-center gap-2">
            <Button asChild size="sm" variant={showDone ? "default" : "outline"}>
              <Link href={showDone ? "/activities" : "/activities?done=1"}>{showDone ? "完了済みを隠す" : "完了済みも表示"}</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/deals"><KanbanSquare className="size-4" /> 案件カンバン</Link>
            </Button>
          </div>
        }
      />

      {open.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          <CalendarCheck className="mx-auto mb-2 size-6" />
          未完了の行動はありません。案件の詳細画面の「行動」タブから、期限付きの Todo を登録できます。
        </div>
      ) : (
        <div className="space-y-4">
          {groups.filter((g) => g.items.length > 0).map((g) => (
            <Card key={g.key} className={g.key === "overdue" ? "border-rose-300 dark:border-rose-900" : g.key === "today" ? "border-amber-300 dark:border-amber-900" : ""}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  {g.label}
                  <Badge variant={g.key === "overdue" ? "destructive" : "secondary"} className="h-5 px-1.5">{g.items.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="divide-y">
                {g.items.map((a) => <ActivityRow key={a.id} activity={a} />)}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      {overdue > 0 && <p className="mt-3 text-xs text-muted-foreground">期限超過が {overdue} 件あります。対応済みならチェックを付けるか、案件の「行動」タブで期限を変更してください。</p>}

      {showDone && (
        <Card className="mt-6">
          <CardHeader className="pb-2"><CardTitle className="text-base">完了済み(直近 50 件)</CardTitle></CardHeader>
          <CardContent className="divide-y">
            {done.length ? done.map((a) => <ActivityRow key={a.id} activity={a} />) : <p className="text-sm text-muted-foreground">完了済みの行動はありません</p>}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
