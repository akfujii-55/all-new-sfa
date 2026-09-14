import { Building2, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CompanyDialog } from "@/components/companies/company-dialog";
import { CompaniesTable, type CompanyRow } from "@/components/companies/companies-table";

export const metadata = { title: "取引先" };

export default async function CompaniesPage({ searchParams }: PageProps<"/companies">) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const supabase = await createClient();
  let query = supabase
    .from("companies")
    .select("*, contacts(count), deals(stage, amount)")
    .order("updated_at", { ascending: false });
  if (q) query = query.or(`name.ilike.%${q}%,domain.ilike.%${q}%,industry.ilike.%${q}%`);
  const { data } = await query;

  const rows = (data ?? []) as unknown as CompanyRow[];

  return (
    <div>
      <PageHeader
        title="取引先"
        description="取引先企業の一覧。メール受信時に自動登録されます。取引先側の担当者は「担当者」メニューで管理します。"
        actions={<CompanyDialog trigger={<Button size="sm"><Plus className="size-4" /> 取引先を登録</Button>} />}
      />
      <form className="mb-4" action="/companies">
        <Input name="q" defaultValue={q} placeholder="会社名・ドメイン・業種で検索" className="w-72" />
      </form>

      {rows.length === 0 ? (
        <EmptyState icon={Building2} title="取引先がありません" description="メールを同期するか、手動で登録してください。" />
      ) : (
        <CompaniesTable rows={rows} />
      )}
    </div>
  );
}
