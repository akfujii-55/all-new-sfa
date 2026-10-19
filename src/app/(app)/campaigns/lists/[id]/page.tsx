import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Pencil, Send } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { MailingListDialog } from "@/components/campaigns/mailing-list-dialog";
import { ListContacts, type ContactCandidate, type ListContactRow } from "@/components/campaigns/list-contacts";
import type { MailingList } from "@/lib/types";

export const metadata = { title: "配信リスト" };

export default async function MailingListDetailPage({ params }: PageProps<"/campaigns/lists/[id]">) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: list }, { data: memberRows }, { data: allContacts }] = await Promise.all([
    supabase.from("mailing_lists").select("*").eq("id", id).maybeSingle(),
    supabase.from("mailing_list_contacts").select("created_at, contact:contacts(id, name, email, title, unsubscribed_at, company:companies(id, name))").eq("list_id", id).order("created_at", { ascending: false }).limit(10000),
    supabase.from("contacts").select("id, name, email, company:companies(name)").order("name").limit(10000),
  ]);
  if (!list) notFound();
  const l = list as MailingList;
  type MemberRow = { created_at: string; contact: { id: string; name: string; email: string | null; title: string | null; unsubscribed_at: string | null; company: { id: string; name: string } | { id: string; name: string }[] | null } | null };
  const rows: ListContactRow[] = ((memberRows ?? []) as unknown as MemberRow[])
    .filter((r) => r.contact)
    .map((r) => {
      const c = r.contact!;
      const company = Array.isArray(c.company) ? c.company[0] ?? null : c.company;
      return { id: c.id, name: c.name, email: c.email, title: c.title, unsubscribed_at: c.unsubscribed_at, company, added_at: r.created_at };
    });
  const candidates: ContactCandidate[] = ((allContacts ?? []) as unknown as { id: string; name: string; email: string | null; company: { name: string } | { name: string }[] | null }[]).map((c) => ({
    id: c.id,
    name: c.name,
    email: c.email,
    company_name: (Array.isArray(c.company) ? c.company[0] : c.company)?.name ?? null,
  }));

  return (
    <div>
      <Button asChild variant="ghost" size="sm" className="mb-3 -ml-2"><Link href="/campaigns/lists"><ArrowLeft className="size-4" /> 配信リスト</Link></Button>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight">{l.name}</h1>
            <MailingListDialog list={l} trigger={<Button size="sm" variant="ghost" aria-label="リスト名・説明を編集"><Pencil className="size-4" /></Button>} />
          </div>
          {l.description && <p className="mt-1 text-sm text-muted-foreground">{l.description}</p>}
        </div>
        <Button asChild size="sm"><Link href={`/campaigns/new?list=${l.id}`}><Send className="size-4" /> このリストに配信</Link></Button>
      </div>
      <ListContacts listId={l.id} listName={l.name} rows={rows} candidates={candidates} />
    </div>
  );
}
