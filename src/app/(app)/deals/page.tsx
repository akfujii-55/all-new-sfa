import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { KanbanBoard } from "@/components/deals/kanban-board";
import { NewDealDialog } from "@/components/deals/new-deal-dialog";
import type { Deal } from "@/lib/types";

export const metadata = { title: "案件" };

export default async function DealsPage() {
  const supabase = await createClient();
  const [{ data: deals }, { data: companies }, { data: contacts }] = await Promise.all([
    supabase
      .from("deals")
      .select("*, company:companies(id,name), contact:contacts(id,name,email), owner:profiles(id,full_name)")
      .order("sort_order")
      .order("updated_at", { ascending: false }),
    supabase.from("companies").select("id, name").order("name"),
    supabase.from("contacts").select("id, name, company_id").order("name"),
  ]);

  return (
    <div>
      <PageHeader
        title="案件"
        description="ドラッグ&ドロップでステージを変更。成約にすると売上計上を入力します。"
        actions={
          <NewDealDialog
            companies={companies ?? []}
            contacts={contacts ?? []}
            trigger={<Button size="sm"><Plus className="size-4" /> 案件を作成</Button>}
          />
        }
      />
      <KanbanBoard deals={(deals ?? []) as unknown as Deal[]} />
    </div>
  );
}
