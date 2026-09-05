import Link from "next/link";
import { Users, Plus, Pencil, Mail } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ContactDialog } from "@/components/companies/contact-dialog";
import { ComposeDialog } from "@/components/inbox/compose-dialog";
import type { Contact } from "@/lib/types";

export const metadata = { title: "担当者" };

export default async function ContactsPage({ searchParams }: PageProps<"/contacts">) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const supabase = await createClient();
  let query = supabase.from("contacts").select("*, company:companies(id,name)").order("updated_at", { ascending: false });
  if (q) query = query.or(`name.ilike.%${q}%,email.ilike.%${q}%,title.ilike.%${q}%`);
  const [{ data }, { data: companies }] = await Promise.all([query, supabase.from("companies").select("id, name").order("name")]);
  const rows = (data ?? []) as unknown as Contact[];

  return (
    <div>
      <PageHeader
        title="担当者"
        description="顧客企業の担当者一覧"
        actions={<ContactDialog companies={companies ?? []} trigger={<Button size="sm"><Plus className="size-4" /> 担当者を登録</Button>} />}
      />
      <form className="mb-4" action="/contacts">
        <Input name="q" defaultValue={q} placeholder="氏名・メール・役職で検索" className="w-72" />
      </form>
      {rows.length === 0 ? (
        <EmptyState icon={Users} title="担当者がいません" description="メールを同期すると送信者が自動登録されます。" />
      ) : (
        <div className="rounded-lg border bg-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>氏名</TableHead>
                <TableHead>会社</TableHead>
                <TableHead className="hidden md:table-cell">役職</TableHead>
                <TableHead className="hidden sm:table-cell">メール</TableHead>
                <TableHead className="hidden lg:table-cell">電話</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell>{p.company ? <Link href={`/companies/${p.company.id}`} className="hover:underline">{p.company.name}</Link> : <span className="text-muted-foreground">-</span>}</TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground">{p.title ?? "-"}</TableCell>
                  <TableCell className="hidden sm:table-cell text-muted-foreground">{p.email ?? "-"}</TableCell>
                  <TableCell className="hidden lg:table-cell text-muted-foreground">{p.phone ?? "-"}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      {p.email && <ComposeDialog defaults={{ to: p.email, contactId: p.id, companyId: p.company_id }} trigger={<Button size="sm" variant="ghost"><Mail className="size-4" /></Button>} />}
                      <ContactDialog contact={p} companies={companies ?? []} trigger={<Button size="sm" variant="ghost"><Pencil className="size-4" /></Button>} />
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
