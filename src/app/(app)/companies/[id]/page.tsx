import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Globe, Phone, MapPin, Plus, Pencil, Mail, User } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CompanyDialog } from "@/components/companies/company-dialog";
import { ContactDialog } from "@/components/companies/contact-dialog";
import { NewDealDialog } from "@/components/deals/new-deal-dialog";
import { StageBadge } from "@/components/deals/stage-badge";
import { ComposeDialog } from "@/components/inbox/compose-dialog";
import { fmtDate, fmtRelative, yen } from "@/lib/format";
import { INQUIRY_STATUS_LABEL, type Company, type Contact, type Deal, type Email, type Inquiry } from "@/lib/types";

export default async function CompanyDetailPage({ params }: PageProps<"/companies/[id]">) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: company } = await supabase.from("companies").select("*").eq("id", id).maybeSingle();
  if (!company) notFound();

  const [{ data: contacts }, { data: deals }, { data: inquiries }, { data: emails }, { data: companies }, { data: allContacts }, { data: members }] = await Promise.all([
    supabase.from("contacts").select("*").eq("company_id", id).order("name"),
    supabase.from("deals").select("*, contact:contacts(id,name,email)").eq("company_id", id).order("updated_at", { ascending: false }),
    supabase.from("inquiries").select("*, contact:contacts(id,name,email), deal:deals!inquiries_deal_id_fkey(id,title)").eq("company_id", id).order("received_at", { ascending: false }),
    supabase.from("emails").select("id, thread_key, direction, from_name, from_address, subject, snippet, received_at, is_read, deal:deals(id,title)").eq("company_id", id).order("received_at", { ascending: false }).limit(100),
    supabase.from("companies").select("id, name").order("name"),
    supabase.from("contacts").select("id, name, company_id").order("name"),
    supabase.from("members").select("id, name").eq("is_active", true).order("sort_order").order("created_at"),
  ]);
  const c = company as Company;
  const wonTotal = (deals ?? []).filter((d) => d.stage === "won").reduce((a, d) => a + Number(d.amount), 0);

  return (
    <div>
      <Button asChild variant="ghost" size="sm" className="mb-3 -ml-2">
        <Link href="/companies"><ArrowLeft className="size-4" /> 取引先一覧</Link>
      </Button>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{c.name}</h1>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {c.industry && <span>{c.industry}</span>}
            {c.domain && <span>@{c.domain}</span>}
            {c.website && <a href={c.website} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:underline"><Globe className="size-3.5" /> Web</a>}
            {c.phone && <span className="flex items-center gap-1"><Phone className="size-3.5" /> {c.phone}</span>}
            {c.address && <span className="flex items-center gap-1"><MapPin className="size-3.5" /> {c.address}</span>}
          </div>
        </div>
        <div className="flex gap-2">
          <NewDealDialog companies={companies ?? []} contacts={allContacts ?? []} members={members ?? []} defaults={{ company_id: id }} trigger={<Button size="sm"><Plus className="size-4" /> 案件を作成</Button>} />
          <CompanyDialog company={c} trigger={<Button size="sm" variant="outline"><Pencil className="size-4" /> 編集</Button>} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3 mb-6">
        <Card><CardContent className="pt-0"><p className="text-sm text-muted-foreground">進行中案件</p><p className="text-2xl font-semibold tabular-nums">{(deals ?? []).filter((d) => d.stage !== "won" && d.stage !== "lost").length} 件</p></CardContent></Card>
        <Card><CardContent className="pt-0"><p className="text-sm text-muted-foreground">成約額累計</p><p className="text-2xl font-semibold tabular-nums">{yen(wonTotal)}</p></CardContent></Card>
        <Card><CardContent className="pt-0"><p className="text-sm text-muted-foreground">メール</p><p className="text-2xl font-semibold tabular-nums">{emails?.length ?? 0} 件</p></CardContent></Card>
      </div>
      {c.memo && <Card className="mb-6"><CardContent className="pt-0 text-sm whitespace-pre-wrap">{c.memo}</CardContent></Card>}

      <Tabs defaultValue="deals">
        <TabsList>
          <TabsTrigger value="deals">案件 <Badge variant="secondary" className="ml-1.5 h-5 px-1.5">{deals?.length ?? 0}</Badge></TabsTrigger>
          <TabsTrigger value="contacts">担当者 <Badge variant="secondary" className="ml-1.5 h-5 px-1.5">{contacts?.length ?? 0}</Badge></TabsTrigger>
          <TabsTrigger value="inquiries">問い合わせ <Badge variant="secondary" className="ml-1.5 h-5 px-1.5">{inquiries?.length ?? 0}</Badge></TabsTrigger>
          <TabsTrigger value="emails">メール <Badge variant="secondary" className="ml-1.5 h-5 px-1.5">{emails?.length ?? 0}</Badge></TabsTrigger>
        </TabsList>

        <TabsContent value="deals" className="mt-4">
          <Card>
            <CardContent className="pt-0 divide-y">
              {(deals as unknown as Deal[] | null)?.length ? (deals as unknown as Deal[]).map((d) => (
                <div key={d.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <Link href={`/deals/${d.id}`} className="font-medium hover:underline">{d.title}</Link>
                    <p className="text-xs text-muted-foreground">{d.contact?.name ?? "-"} · 更新 {fmtRelative(d.updated_at)}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="tabular-nums text-sm font-medium">{yen(d.amount)}</span>
                    <StageBadge stage={d.stage} />
                  </div>
                </div>
              )) : <p className="text-sm text-muted-foreground">案件はまだありません</p>}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="contacts" className="mt-4">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-base">担当者</CardTitle>
              <ContactDialog companies={companies ?? []} defaultCompanyId={id} trigger={<Button size="sm" variant="outline"><Plus className="size-4" /> 追加</Button>} />
            </CardHeader>
            <CardContent className="divide-y">
              {(contacts as Contact[] | null)?.length ? (contacts as Contact[]).map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex size-9 items-center justify-center rounded-full bg-muted"><User className="size-4 text-muted-foreground" /></div>
                    <div className="min-w-0">
                      <p className="font-medium">{p.name}{p.title && <span className="ml-2 text-xs text-muted-foreground">{p.title}</span>}</p>
                      <p className="text-xs text-muted-foreground truncate">{p.email ?? "-"}{p.phone ? ` · ${p.phone}` : ""}</p>
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {p.email && <ComposeDialog defaults={{ to: p.email, contactId: p.id, companyId: id }} trigger={<Button size="sm" variant="ghost"><Mail className="size-4" /></Button>} />}
                    <ContactDialog contact={p} companies={companies ?? []} trigger={<Button size="sm" variant="ghost"><Pencil className="size-4" /></Button>} />
                  </div>
                </div>
              )) : <p className="text-sm text-muted-foreground">担当者はまだ登録されていません</p>}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="inquiries" className="mt-4">
          <Card>
            <CardContent className="pt-0 divide-y">
              {(inquiries as unknown as Inquiry[] | null)?.length ? (inquiries as unknown as Inquiry[]).map((q) => (
                <div key={q.id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium">{q.subject}</p>
                    <div className="flex items-center gap-2 shrink-0">
                      {q.category && <Badge variant="secondary">{q.category}</Badge>}
                      <Badge variant="outline">{INQUIRY_STATUS_LABEL[q.status]}</Badge>
                    </div>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{q.summary}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{fmtDate(q.received_at)} · {q.contact?.name ?? "-"}{q.deal && <> · <Link href={`/deals/${q.deal.id}`} className="hover:underline">案件: {q.deal.title}</Link></>}</p>
                </div>
              )) : <p className="text-sm text-muted-foreground">問い合わせはまだありません</p>}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="emails" className="mt-4">
          <Card>
            <CardContent className="pt-0 divide-y">
              {(emails as unknown as Email[] | null)?.length ? (emails as unknown as Email[]).map((e) => (
                <Link key={e.id} href={`/inbox/${e.id}`} className="block py-3 first:pt-0 last:pb-0 hover:bg-accent/40 -mx-2 px-2 rounded">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium truncate"><Badge variant={e.direction === "inbound" ? "secondary" : "outline"} className="mr-2">{e.direction === "inbound" ? "受信" : "送信"}</Badge>{e.subject || "(件名なし)"}</p>
                    <span className="text-xs text-muted-foreground shrink-0">{fmtRelative(e.received_at)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">{e.snippet}</p>
                </Link>
              )) : <p className="text-sm text-muted-foreground">メールはまだありません</p>}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
