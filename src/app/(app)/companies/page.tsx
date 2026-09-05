import Link from "next/link";
import { Building2, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CompanyDialog } from "@/components/companies/company-dialog";
import { fmtDate, yen } from "@/lib/format";

export const metadata = { title: "顧客" };

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

  type Row = { id: string; name: string; domain: string | null; industry: string | null; updated_at: string; contacts: { count: number }[]; deals: { stage: string; amount: number }[] };
  const rows = (data ?? []) as unknown as Row[];

  return (
    <div>
      <PageHeader
        title="顧客"
        description="取引先企業の一覧。メール受信時に自動登録されます。"
        actions={<CompanyDialog trigger={<Button size="sm"><Plus className="size-4" /> 顧客を登録</Button>} />}
      />
      <form className="mb-4" action="/companies">
        <Input name="q" defaultValue={q} placeholder="会社名・ドメイン・業種で検索" className="w-72" />
      </form>

      {rows.length === 0 ? (
        <EmptyState icon={Building2} title="顧客がありません" description="メールを同期するか、手動で登録してください。" />
      ) : (
        <div className="rounded-lg border bg-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>会社名</TableHead>
                <TableHead className="hidden md:table-cell">ドメイン</TableHead>
                <TableHead className="hidden lg:table-cell">業種</TableHead>
                <TableHead className="text-right">担当者</TableHead>
                <TableHead className="text-right">進行中案件</TableHead>
                <TableHead className="text-right hidden sm:table-cell">成約額</TableHead>
                <TableHead className="hidden lg:table-cell">更新</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((c) => {
                const open = c.deals.filter((d) => d.stage !== "won" && d.stage !== "lost");
                const won = c.deals.filter((d) => d.stage === "won").reduce((a, d) => a + Number(d.amount), 0);
                return (
                  <TableRow key={c.id}>
                    <TableCell><Link href={`/companies/${c.id}`} className="font-medium hover:underline">{c.name}</Link></TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground">{c.domain ?? "-"}</TableCell>
                    <TableCell className="hidden lg:table-cell text-muted-foreground">{c.industry ?? "-"}</TableCell>
                    <TableCell className="text-right tabular-nums">{c.contacts[0]?.count ?? 0}</TableCell>
                    <TableCell className="text-right tabular-nums">{open.length} 件{open.length > 0 && <span className="text-muted-foreground"> / {yen(open.reduce((a, d) => a + Number(d.amount), 0))}</span>}</TableCell>
                    <TableCell className="text-right tabular-nums hidden sm:table-cell">{won > 0 ? yen(won) : "-"}</TableCell>
                    <TableCell className="hidden lg:table-cell text-muted-foreground">{fmtDate(c.updated_at)}</TableCell>
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
