import Link from "next/link";
import { Fragment } from "react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RevenueChart } from "@/components/dashboard/revenue-chart";
import { fmtMonth, yen } from "@/lib/format";
import type { Revenue } from "@/lib/types";

export const metadata = { title: "売上" };

export default async function RevenuePage({ searchParams }: PageProps<"/revenue">) {
  const sp = await searchParams;
  const year = Number(typeof sp.year === "string" ? sp.year : new Date().getFullYear());
  const supabase = await createClient();
  const { data } = await supabase
    .from("revenues")
    .select("*, deal:deals(id,title), company:companies(id,name)")
    .gte("year_month", `${year}-01-01`)
    .lte("year_month", `${year}-12-01`)
    .order("year_month");
  const rows = (data ?? []) as unknown as Revenue[];

  const series = Array.from({ length: 12 }, (_, i) => {
    const m = String(i + 1).padStart(2, "0");
    const amount = rows.filter((r) => String(r.year_month).startsWith(`${year}-${m}`)).reduce((a, r) => a + Number(r.amount), 0);
    return { month: `${year}-${m}`, label: `${i + 1}月`, amount };
  });
  const total = series.reduce((a, s) => a + s.amount, 0);
  const byMonth = new Map<string, Revenue[]>();
  for (const r of rows) {
    const k = String(r.year_month).slice(0, 7);
    byMonth.set(k, [...(byMonth.get(k) ?? []), r]);
  }

  return (
    <div>
      <PageHeader
        title="売上"
        description="成約案件の月次売上計上"
        actions={
          <div className="flex items-center gap-1">
            <Button asChild variant="outline" size="sm"><Link href={`/revenue?year=${year - 1}`}>{year - 1}</Link></Button>
            <Button variant="default" size="sm" className="pointer-events-none">{year}年</Button>
            <Button asChild variant="outline" size="sm"><Link href={`/revenue?year=${year + 1}`}>{year + 1}</Link></Button>
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3 mb-6">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base">{year}年 月次売上</CardTitle></CardHeader>
          <CardContent><RevenueChart data={series} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">年間合計</CardTitle></CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold tabular-nums">{yen(total)}</p>
            <p className="mt-1 text-sm text-muted-foreground">{rows.length} 件の計上 · {new Set(rows.map((r) => r.deal_id)).size} 案件</p>
          </CardContent>
        </Card>
      </div>

      <div className="rounded-lg border bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>計上月</TableHead>
              <TableHead>案件</TableHead>
              <TableHead>顧客</TableHead>
              <TableHead className="hidden md:table-cell">メモ</TableHead>
              <TableHead className="text-right">金額</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-10">{year}年の売上計上はありません</TableCell></TableRow>
            )}
            {Array.from(byMonth.entries()).map(([k, list]) => (
              <Fragment key={k}>
                {list.map((r, i) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{i === 0 ? fmtMonth(r.year_month) : ""}</TableCell>
                    <TableCell><Link href={`/deals/${r.deal_id}`} className="hover:underline">{r.deal?.title ?? "-"}</Link></TableCell>
                    <TableCell><Link href={`/companies/${r.company_id}`} className="hover:underline text-muted-foreground">{r.company?.name ?? "-"}</Link></TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground">{r.memo ?? ""}</TableCell>
                    <TableCell className="text-right tabular-nums">{yen(r.amount)}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-muted/40">
                  <TableCell colSpan={4} className="text-right text-sm font-medium">{fmtMonth(`${k}-01`)} 小計</TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">{yen(list.reduce((a, r) => a + Number(r.amount), 0))}</TableCell>
                </TableRow>
              </Fragment>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
