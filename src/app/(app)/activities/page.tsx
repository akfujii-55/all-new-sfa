import Link from "next/link";
import { CalendarCheck, KanbanSquare, UserRound, X } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ActivityRow } from "@/components/deals/activity-row";
import { groupByDue } from "@/lib/activities";
import type { DealActivity } from "@/lib/types";

export const metadata = { title: "行動" };

const SELECT = "*, kind:activity_kinds(id,name,icon), owner:members(id,name), deal:deals(id,title,stage,company:companies(id,name))";

/** 全案件の行動(Todo)を期限の状態ごとに一覧する。完了はここからも付けられる。担当者で絞り込める */
export default async function ActivitiesPage({ searchParams }: PageProps<"/activities">) {
  const sp = await searchParams;
  const showDone = sp.done === "1";
  // 担当者の絞り込み: "none" は担当者なし、それ以外は members.id(問い合わせ一覧と同じ形)
  const owner = typeof sp.owner === "string" && sp.owner ? sp.owner : null;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();

  // 担当者の条件を足す(PostgREST のフィルタは順不同なので、最後に付けてよい)
  let openQuery = supabase.from("deal_activities").select(SELECT).is("done_at", null).order("due_at", { ascending: true, nullsFirst: false }).order("created_at", { ascending: false });
  let doneQuery = supabase.from("deal_activities").select(SELECT).not("done_at", "is", null).order("done_at", { ascending: false }).limit(50);
  if (owner === "none") {
    openQuery = openQuery.is("owner_id", null);
    doneQuery = doneQuery.is("owner_id", null);
  } else if (owner) {
    openQuery = openQuery.eq("owner_id", owner);
    doneQuery = doneQuery.eq("owner_id", owner);
  }

  const [{ data: openRows }, { data: doneRows }, { data: memberRows }] = await Promise.all([
    openQuery,
    showDone ? doneQuery : Promise.resolve({ data: [] as unknown[] }),
    supabase.from("members").select("id, name, profile_id").eq("is_active", true).order("sort_order").order("created_at"),
  ]);
  const open = (openRows ?? []) as unknown as DealActivity[];
  const done = (doneRows ?? []) as unknown as DealActivity[];
  const members = (memberRows ?? []).map((m) => ({ id: m.id as string, name: m.name as string, profile_id: m.profile_id as string | null }));
  const memberOptions = members.map((m) => ({ id: m.id, name: m.name }));
  const me = members.find((m) => m.profile_id === auth.user?.id);
  const groups = groupByDue(open);
  const overdue = groups.find((g) => g.key === "overdue")?.items.length ?? 0;

  const hrefFor = (o: { done?: boolean; owner?: string | null }) => {
    const p = new URLSearchParams();
    if (o.done ?? showDone) p.set("done", "1");
    const w = o.owner === undefined ? owner : o.owner;
    if (w) p.set("owner", w);
    const qs = p.toString();
    return qs ? `/activities?${qs}` : "/activities";
  };
  const ownerLabel = owner === "none" ? "担当者なし" : members.find((m) => m.id === owner)?.name ?? null;

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="行動"
        description="全案件の未完了の行動(電話・メール・訪問・見積書作成・折り返し依頼などの Todo)。期限の近い順に並びます。完了したらチェックを付けてください。"
        actions={
          <div className="flex items-center gap-2">
            <Button asChild size="sm" variant={showDone ? "default" : "outline"}>
              <Link href={hrefFor({ done: !showDone })}>{showDone ? "完了済みを隠す" : "完了済みも表示"}</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/deals"><KanbanSquare className="size-4" /> 案件カンバン</Link>
            </Button>
          </div>
        }
      />

      {members.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-1.5 text-sm">
          <UserRound className="size-4 text-muted-foreground" />
          <span className="mr-1 text-muted-foreground">担当者:</span>
          {[{ id: "none", name: "担当者なし" }, ...memberOptions].map((m) => (
            <Button key={m.id} asChild size="sm" variant={owner === m.id ? "secondary" : "ghost"} className="h-7 px-2">
              <Link href={hrefFor({ owner: owner === m.id ? null : m.id })}>
                {m.name}
                {me && m.id === me.id && <span className="ml-1 text-[10px] text-muted-foreground">(自分)</span>}
              </Link>
            </Button>
          ))}
          {owner && (
            <Link href={hrefFor({ owner: null })} className="ml-1 inline-flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground"><X className="size-3" /> 解除</Link>
          )}
        </div>
      )}

      {open.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          <CalendarCheck className="mx-auto mb-2 size-6" />
          {ownerLabel ? (
            <>「{ownerLabel}」の未完了の行動はありません。<Link href={hrefFor({ owner: null })} className="underline">絞り込みを解除</Link>すると全員分が表示されます。</>
          ) : (
            <>未完了の行動はありません。案件の詳細画面の「行動」タブから、期限付きの Todo を登録できます。</>
          )}
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
                {g.items.map((a) => <ActivityRow key={a.id} activity={a} members={memberOptions} />)}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      {overdue > 0 && <p className="mt-3 text-xs text-muted-foreground">期限超過が {overdue} 件あります。対応済みならチェックを付けるか、案件の「行動」タブで期限を変更してください。</p>}

      {showDone && (
        <Card className="mt-6">
          <CardHeader className="pb-2"><CardTitle className="text-base">完了済み(直近 50 件{ownerLabel ? `・${ownerLabel}` : ""})</CardTitle></CardHeader>
          <CardContent className="divide-y">
            {done.length ? done.map((a) => <ActivityRow key={a.id} activity={a} />) : <p className="text-sm text-muted-foreground">完了済みの行動はありません</p>}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
