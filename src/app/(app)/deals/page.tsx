import Link from "next/link";
import { Plus, UserCog } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { KanbanBoard } from "@/components/deals/kanban-board";
import { NewDealDialog } from "@/components/deals/new-deal-dialog";
import type { Deal, Member } from "@/lib/types";

export const metadata = { title: "案件" };

export default async function DealsPage({ searchParams }: PageProps<"/deals">) {
  const sp = await searchParams;
  const owner = typeof sp.owner === "string" ? sp.owner : "all";

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();

  let dealsQuery = supabase
    .from("deals")
    .select("*, company:companies(id,name), contact:contacts(id,name,email), owner:members(id,name)")
    .order("sort_order")
    .order("updated_at", { ascending: false });
  if (owner === "none") dealsQuery = dealsQuery.is("owner_id", null);
  else if (owner !== "all") dealsQuery = dealsQuery.eq("owner_id", owner);

  const [{ data: deals }, { data: companies }, { data: contacts }, { data: memberRows }, { data: unassigned }] = await Promise.all([
    dealsQuery,
    supabase.from("companies").select("id, name").order("name"),
    supabase.from("contacts").select("id, name, company_id").order("name"),
    supabase.from("members").select("*").order("sort_order").order("created_at"),
    supabase.from("deals").select("id").is("owner_id", null).limit(1),
  ]);
  const members = ((memberRows ?? []) as Member[]).filter((m) => m.is_active || m.id === owner);
  const me = members.find((m) => m.profile_id === auth.user?.id);
  const hasUnassigned = (unassigned ?? []).length > 0 || owner === "none";

  const tabs: { key: string; label: string }[] = [
    { key: "all", label: "すべて" },
    ...members.map((m) => ({ key: m.id, label: m.name })),
    ...(hasUnassigned ? [{ key: "none", label: "担当未設定" }] : []),
  ];

  return (
    <div>
      <PageHeader
        title="案件"
        description="ドラッグ&ドロップでステージを変更。成約にすると売上計上を入力します。"
        actions={
          <NewDealDialog
            companies={companies ?? []}
            contacts={contacts ?? []}
            members={members}
            defaults={{ owner_id: owner !== "all" && owner !== "none" ? owner : me?.id }}
            trigger={<Button size="sm"><Plus className="size-4" /> 案件を作成</Button>}
          />
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <UserCog className="size-4 text-muted-foreground" />
        {tabs.map((t) => (
          <Button key={t.key} asChild size="sm" variant={owner === t.key ? "default" : "outline"}>
            <Link href={t.key === "all" ? "/deals" : `/deals?owner=${t.key}`}>{t.label}</Link>
          </Button>
        ))}
        {members.length === 0 && (
          <Button asChild size="sm" variant="ghost"><Link href="/members">営業担当を登録</Link></Button>
        )}
      </div>

      <KanbanBoard deals={(deals ?? []) as unknown as Deal[]} />
    </div>
  );
}
