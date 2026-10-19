import Link from "next/link";
import { ArrowLeft, ListChecks, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MailingListDialog } from "@/components/campaigns/mailing-list-dialog";
import { MAX_MAILING_LISTS } from "@/lib/campaigns-shared";
import { fmtDate } from "@/lib/format";
import { listMailingListsWithCounts } from "../_lib";

export const metadata = { title: "配信リスト" };

export default async function MailingListsPage() {
  const supabase = await createClient();
  const lists = await listMailingListsWithCounts(supabase);
  return (
    <div>
      <Button asChild variant="ghost" size="sm" className="mb-3 -ml-2"><Link href="/campaigns"><ArrowLeft className="size-4" /> 配信一覧</Link></Button>
      <PageHeader
        title="配信リスト"
        description={`一斉配信の宛先にする担当者のリスト。担当者一覧の選択から追加するか、CSV を読み込みます(最大 ${MAX_MAILING_LISTS} 個)。`}
        actions={<MailingListDialog trigger={<Button size="sm"><Plus className="size-4" /> リストを作成</Button>} />}
      />
      {lists.length === 0 ? (
        <EmptyState icon={ListChecks} title="配信リストがありません" description="リストを作って担当者を入れると、配信の宛先に選べます。" action={<MailingListDialog trigger={<Button size="sm"><Plus className="size-4" /> リストを作成</Button>} />} />
      ) : (
        <div className="rounded-lg border bg-card scroll-x">
          <Table className="min-w-[640px]">
            <TableHeader>
              <TableRow>
                <TableHead>リスト名</TableHead>
                <TableHead>説明</TableHead>
                <TableHead className="text-right">人数</TableHead>
                <TableHead className="text-right">送れる宛先</TableHead>
                <TableHead>作成日</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lists.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="font-medium"><Link href={`/campaigns/lists/${l.id}`} className="hover:underline">{l.name}</Link></TableCell>
                  <TableCell className="text-muted-foreground">{l.description ?? ""}</TableCell>
                  <TableCell className="text-right tabular-nums">{l.total}</TableCell>
                  <TableCell className="text-right tabular-nums">{l.sendable}</TableCell>
                  <TableCell className="text-muted-foreground">{fmtDate(l.created_at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
