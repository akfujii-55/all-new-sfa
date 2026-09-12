import { Users, Plus, Building2, Download } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ContactDialog } from "@/components/companies/contact-dialog";
import { CompanyDialog } from "@/components/companies/company-dialog";
import { ContactsTable } from "@/components/contacts/contacts-table";
import { TagFilter } from "@/components/tags/tag-filter";
import { tagsFromRows } from "@/lib/tags";
import type { Contact, Tag } from "@/lib/types";

export const metadata = { title: "担当者" };

export default async function ContactsPage({ searchParams }: PageProps<"/contacts">) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const tagId = typeof sp.tag === "string" && sp.tag ? sp.tag : null;
  const supabase = await createClient();
  let query = supabase
    .from("contacts")
    .select(`*, company:companies(id,name), tags:contact_tags(tag:tags(id,name,color,sort_order,created_at))${tagId ? ", filter_tags:contact_tags!inner(tag_id)" : ""}`)
    .order("updated_at", { ascending: false });
  if (tagId) query = query.eq("filter_tags.tag_id", tagId);
  if (q) query = query.or(`name.ilike.%${q}%,email.ilike.%${q}%,title.ilike.%${q}%`);
  const [{ data }, { data: companies }, { data: tagRows }] = await Promise.all([
    query,
    supabase.from("companies").select("id, name").order("name"),
    supabase.from("tags").select("*").order("sort_order").order("created_at"),
  ]);
  const rows = ((data ?? []) as unknown as (Contact & { tags: { tag: Tag | Tag[] | null }[] })[]).map((c) => ({ ...c, tags: tagsFromRows(c.tags) }));
  const allTags = (tagRows ?? []) as Tag[];
  const activeTag = allTags.find((t) => t.id === tagId) ?? null;
  const exportHref = `/api/contacts/export?${new URLSearchParams({ ...(tagId ? { tag: tagId } : {}), ...(q ? { q } : {}) }).toString()}`;
  const hrefForTag = (id: string | null) => `/contacts?${new URLSearchParams({ ...(q ? { q } : {}), ...(id ? { tag: id } : {}) }).toString()}`;

  return (
    <div>
      <PageHeader
        title="担当者"
        description="取引先側の担当者一覧。メール同期で送信者が自動登録されます。タグで絞り込んで送信リスト(CSV)を作れます。"
        actions={
          <>
            <CompanyDialog trigger={<Button size="sm" variant="outline"><Building2 className="size-4" /> 会社を登録</Button>} />
            <ContactDialog companies={companies ?? []} trigger={<Button size="sm"><Plus className="size-4" /> 担当者を登録</Button>} />
          </>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <form action="/contacts" className="flex items-center gap-2">
          {tagId && <input type="hidden" name="tag" value={tagId} />}
          <Input name="q" defaultValue={q} placeholder="氏名・メール・役職で検索" className="w-72" />
        </form>
        <Button asChild size="sm" variant="outline" className="ml-auto">
          <a href={exportHref}>
            <Download className="size-4" /> {activeTag ? `「${activeTag.name}」の送信リストをダウンロード` : "送信リストをダウンロード"}({rows.length}名)
          </a>
        </Button>
      </div>
      <TagFilter tags={allTags} active={tagId} hrefFor={hrefForTag} />
      {rows.length === 0 ? (
        <EmptyState icon={Users} title="担当者がいません" description={tagId || q ? "条件に合う担当者がいません。タグや検索語を変えてください。" : "メールを同期すると送信者が自動登録されます。"} />
      ) : (
        <ContactsTable rows={rows} companies={companies ?? []} tags={allTags} />
      )}
    </div>
  );
}
