import { UserCog, Plus, Pencil } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MemberDialog } from "@/components/members/member-dialog";
import { InviteButton } from "@/components/members/invite-button";
import { fmtDate } from "@/lib/format";
import type { Member } from "@/lib/types";

export const metadata = { title: "営業担当者" };

export default async function MembersPage() {
  const supabase = await createClient();
  const [{ data }, { data: dealCounts }] = await Promise.all([
    supabase.from("members").select("*").order("is_active", { ascending: false }).order("sort_order").order("created_at"),
    supabase.from("deals").select("owner_id").not("stage", "in", '("won","lost")').not("owner_id", "is", null),
  ]);
  const rows = (data ?? []) as Member[];
  const openByOwner = new Map<string, number>();
  for (const d of dealCounts ?? []) {
    if (d.owner_id) openByOwner.set(d.owner_id, (openByOwner.get(d.owner_id) ?? 0) + 1);
  }

  return (
    <div>
      <PageHeader
        title="営業担当者"
        description="自社の営業担当者。メールアドレスを登録して「招待」を押すと、このアプリにログインできるようになります。"
        actions={<MemberDialog trigger={<Button size="sm"><Plus className="size-4" /> 営業担当者を登録</Button>} />}
      />
      {rows.length === 0 ? (
        <EmptyState
          icon={UserCog}
          title="営業担当者がいません"
          description="ログインユーザーは自動的に登録されます。ログインしないメンバーもここから追加できます。"
          action={<MemberDialog trigger={<Button size="sm"><Plus className="size-4" /> 営業担当者を登録</Button>} />}
        />
      ) : (
        <div className="rounded-lg border bg-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>氏名</TableHead>
                <TableHead className="hidden sm:table-cell">メール</TableHead>
                <TableHead className="text-right">進行中の案件</TableHead>
                <TableHead className="hidden md:table-cell">状態</TableHead>
                <TableHead className="w-32" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((m) => (
                <TableRow key={m.id} className={m.is_active ? "" : "text-muted-foreground"}>
                  <TableCell className="font-medium">
                    {m.name}
                    {m.profile_id ? (
                      <Badge variant="outline" className="ml-2 hidden sm:inline-flex">ログイン可</Badge>
                    ) : m.invited_at ? (
                      <Badge variant="secondary" className="ml-2 hidden sm:inline-flex">招待済み {fmtDate(m.invited_at)}</Badge>
                    ) : null}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-muted-foreground">{m.email ?? "-"}</TableCell>
                  <TableCell className="text-right tabular-nums">{openByOwner.get(m.id) ?? 0}</TableCell>
                  <TableCell className="hidden md:table-cell">
                    {m.is_active ? <Badge variant="secondary">有効</Badge> : <Badge variant="outline">無効</Badge>}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      {!m.profile_id && m.email && m.is_active && <InviteButton memberId={m.id} resend={Boolean(m.invited_at)} />}
                      <MemberDialog member={m} trigger={<Button size="sm" variant="ghost"><Pencil className="size-4" /></Button>} />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
