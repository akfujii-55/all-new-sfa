"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Mail, Pencil } from "lucide-react";
import { setContactTags } from "@/actions/tags";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ContactDialog } from "@/components/companies/contact-dialog";
import { ComposeDialog } from "@/components/inbox/compose-dialog";
import { TagPicker } from "@/components/tags/tag-picker";
import { TagBadges } from "@/components/tags/tag-badge";
import type { Contact, Tag } from "@/lib/types";

export function ContactsTable({ rows, companies, tags }: { rows: Contact[]; companies: { id: string; name: string }[]; tags: Tag[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();
  const ids = rows.map((r) => r.id);
  const allChecked = ids.length > 0 && ids.every((id) => selected.has(id));
  const someChecked = ids.some((id) => selected.has(id));
  const selectedIds = ids.filter((id) => selected.has(id));
  const current = new Map<string, number>();
  for (const r of rows) {
    if (!selected.has(r.id)) continue;
    for (const t of r.tags ?? []) current.set(t.id, (current.get(t.id) ?? 0) + 1);
  }

  function toggle(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function applyTags(change: { add: string[]; remove: string[] }) {
    start(async () => {
      try {
        await setContactTags(selectedIds, change);
        toast.success(`${selectedIds.length}名のタグを更新しました`);
        setSelected(new Set());
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  }

  return (
    <div className="rounded-lg border bg-card overflow-x-auto">
      <div className="flex items-center gap-3 border-b px-4 py-2">
        <Checkbox checked={allChecked ? true : someChecked ? "indeterminate" : false} onCheckedChange={(v) => setSelected(v === true ? new Set(ids) : new Set())} aria-label="すべて選択" />
        {selectedIds.length > 0 ? (
          <>
            <span className="text-sm text-muted-foreground">{selectedIds.length}名選択</span>
            <TagPicker tags={tags} current={current} onApply={applyTags} pending={pending} description="選択した担当者にタグを付けます" />
          </>
        ) : (
          <span className="text-sm text-muted-foreground">担当者を選択してタグをまとめて付け外しできます</span>
        )}
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8" />
            <TableHead>氏名</TableHead>
            <TableHead>会社</TableHead>
            <TableHead>タグ</TableHead>
            <TableHead className="hidden md:table-cell">役職</TableHead>
            <TableHead className="hidden sm:table-cell">メール</TableHead>
            <TableHead className="hidden lg:table-cell">電話</TableHead>
            <TableHead className="w-24" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((p) => (
            <TableRow key={p.id} data-state={selected.has(p.id) ? "selected" : undefined}>
              <TableCell><Checkbox checked={selected.has(p.id)} onCheckedChange={(v) => toggle(p.id, v === true)} aria-label="選択" /></TableCell>
              <TableCell className="font-medium">{p.name}</TableCell>
              <TableCell>{p.company ? <Link href={`/companies/${p.company.id}`} className="hover:underline">{p.company.name}</Link> : <span className="text-muted-foreground">-</span>}</TableCell>
              <TableCell><TagBadges tags={p.tags ?? []} max={3} /></TableCell>
              <TableCell className="hidden md:table-cell text-muted-foreground">{p.title ?? "-"}</TableCell>
              <TableCell className="hidden sm:table-cell text-muted-foreground">{p.email ?? "-"}</TableCell>
              <TableCell className="hidden lg:table-cell text-muted-foreground">{p.phone ?? "-"}</TableCell>
              <TableCell>
                <div className="flex justify-end gap-1">
                  {p.email && <ComposeDialog defaults={{ to: p.email, contactId: p.id, companyId: p.company_id }} trigger={<Button size="sm" variant="ghost"><Mail className="size-4" /></Button>} />}
                  <ContactDialog contact={p} companies={companies} trigger={<Button size="sm" variant="ghost"><Pencil className="size-4" /></Button>} />
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
