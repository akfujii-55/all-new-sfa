"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Merge, Pencil, Trash2 } from "lucide-react";
import { deleteCompanies } from "@/actions/companies";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CompanyDialog } from "@/components/companies/company-dialog";
import { MergeSelectedDialog } from "@/components/companies/merge-selected-dialog";
import { actionErrorMessage } from "@/lib/errors";
import { fmtDate, yen } from "@/lib/format";
import type { Company } from "@/lib/types";

export type CompanyRow = Company & { contacts: { count: number }[]; deals: { stage: string; amount: number }[] };

export function CompaniesTable({ rows }: { rows: CompanyRow[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();
  const ids = rows.map((r) => r.id);
  const allChecked = ids.length > 0 && ids.every((id) => selected.has(id));
  const someChecked = ids.some((id) => selected.has(id));
  const selectedIds = ids.filter((id) => selected.has(id));

  function toggle(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function removeSelected() {
    if (!confirm(`選択した ${selectedIds.length} 社を削除しますか?\n担当者・メール・問い合わせは残り、取引先だけが外れます。案件がある取引先は削除できません。`)) return;
    start(async () => {
      try {
        await deleteCompanies(selectedIds);
        toast.success(`${selectedIds.length}社を削除しました`);
        setSelected(new Set());
      } catch (e) {
        toast.error(actionErrorMessage(e));
      }
    });
  }

  return (
    <div className="rounded-lg border bg-card overflow-x-auto">
      <div className="flex items-center gap-3 border-b px-4 py-2">
        <Checkbox checked={allChecked ? true : someChecked ? "indeterminate" : false} onCheckedChange={(v) => setSelected(v === true ? new Set(ids) : new Set())} aria-label="すべて選択" />
        {selectedIds.length > 0 ? (
          <>
            <span className="text-sm text-muted-foreground">{selectedIds.length}社選択</span>
            <MergeSelectedDialog
              companies={rows
                .filter((r) => selected.has(r.id))
                .map((r) => ({
                  id: r.id,
                  name: r.name,
                  domain: r.domain,
                  contactCount: r.contacts[0]?.count ?? 0,
                  dealCount: r.deals.length,
                  created_at: r.created_at,
                }))}
              onDone={() => setSelected(new Set())}
              trigger={
                <Button size="sm" variant="outline" disabled={pending || selectedIds.length < 2} title={selectedIds.length < 2 ? "2 社以上選ぶと統合できます" : "選んだ取引先を 1 社にまとめる"}>
                  <Merge className="size-4" /> 統合
                </Button>
              }
            />
            <Button size="sm" variant="outline" className="text-destructive" disabled={pending} onClick={removeSelected}>
              <Trash2 className="size-4" /> {pending ? "削除中..." : "削除"}
            </Button>
          </>
        ) : (
          <span className="text-sm text-muted-foreground">取引先を選択して、まとめて統合・削除できます</span>
        )}
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8" />
            <TableHead>会社名</TableHead>
            <TableHead className="hidden md:table-cell">ドメイン</TableHead>
            <TableHead className="hidden lg:table-cell">業種</TableHead>
            <TableHead className="text-right">担当者</TableHead>
            <TableHead className="text-right">進行中案件</TableHead>
            <TableHead className="text-right hidden sm:table-cell">成約額</TableHead>
            <TableHead className="hidden lg:table-cell">更新</TableHead>
            <TableHead className="w-12" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((c) => {
            const open = c.deals.filter((d) => d.stage !== "won" && d.stage !== "lost");
            const won = c.deals.filter((d) => d.stage === "won").reduce((a, d) => a + Number(d.amount), 0);
            return (
              <TableRow key={c.id} data-state={selected.has(c.id) ? "selected" : undefined}>
                <TableCell><Checkbox checked={selected.has(c.id)} onCheckedChange={(v) => toggle(c.id, v === true)} aria-label="選択" /></TableCell>
                <TableCell><Link href={`/companies/${c.id}`} className="font-medium hover:underline">{c.name}</Link></TableCell>
                <TableCell className="hidden md:table-cell text-muted-foreground">{c.domain ?? "-"}</TableCell>
                <TableCell className="hidden lg:table-cell text-muted-foreground">{c.industry ?? "-"}</TableCell>
                <TableCell className="text-right tabular-nums">{c.contacts[0]?.count ?? 0}</TableCell>
                <TableCell className="text-right tabular-nums">{open.length} 件{open.length > 0 && <span className="text-muted-foreground"> / {yen(open.reduce((a, d) => a + Number(d.amount), 0))}</span>}</TableCell>
                <TableCell className="text-right tabular-nums hidden sm:table-cell">{won > 0 ? yen(won) : "-"}</TableCell>
                <TableCell className="hidden lg:table-cell text-muted-foreground">{fmtDate(c.updated_at)}</TableCell>
                <TableCell>
                  <div className="flex justify-end">
                    <CompanyDialog company={c} trigger={<Button size="sm" variant="ghost" title="編集"><Pencil className="size-4" /></Button>} />
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
