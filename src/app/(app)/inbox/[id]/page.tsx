import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Building2, User, KanbanSquare, MessageSquareText } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getFeatures } from "@/lib/features-server";
import { markEmailRead } from "@/actions/emails";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { EmailBody } from "@/components/inbox/email-body";
import { AttachmentList } from "@/components/inbox/attachment-list";
import { ReplyForm } from "@/components/inbox/reply-form";
import { buildQuote, type MergeVars } from "@/lib/mail/merge";
import { LinkDealSelect } from "@/components/inbox/link-deal-select";
import { ThreadActions } from "@/components/inbox/thread-actions";
import { RelinkDialog } from "@/components/inbox/relink-dialog";
import { ThreadMessage } from "@/components/inbox/thread-message";
import { NewDealDialog } from "@/components/deals/new-deal-dialog";
import { getMailAccountOptions } from "@/lib/mail/options";
import { resolveCounterpart } from "@/lib/mail/link";
import { isInboundAddress } from "@/lib/mail/inbound";
import { extractAddresses, splitAddresses, uniqueAddresses, type AddressOption } from "@/lib/mail/addresses";
import { fmtDateTime } from "@/lib/format";
import { ThreadTags } from "@/components/inbox/thread-tags";
import { tagsFromRows } from "@/lib/tags";
import type { Email, Tag } from "@/lib/types";

export default async function ThreadPage({ params }: PageProps<"/inbox/[id]">) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: root } = await supabase.from("emails").select("thread_key").eq("id", id).maybeSingle();
  if (!root) {
    // ゴミ箱に入っているメールへのリンク(チャット通知・ブラウザの履歴など)はゴミ箱のスレッド画面へ
    const { data: trashed } = await supabase.from("email_trash").select("id").eq("id", id).maybeSingle();
    if (trashed) redirect(`/inbox/trash/${id}`);
    notFound();
  }

  const { data } = await supabase
    .from("emails")
    .select("*, company:companies(id,name), contact:contacts(id,name), deal:deals(id,title), attachments:email_attachments(*), tags:email_tags(tag:tags(id,name,color,sort_order,created_at))")
    .eq("thread_key", root.thread_key)
    .order("received_at", { ascending: true });
  const emails = (data ?? []) as unknown as (Email & { tags?: { tag: Tag | Tag[] | null }[] })[];
  if (emails.length === 0) notFound();
  const threadTags: Tag[] = [];
  for (const e of emails) for (const t of tagsFromRows(e.tags)) if (!threadTags.some((x) => x.id === t.id)) threadTags.push(t);

  const latest = emails[emails.length - 1];
  const latestInbound = [...emails].reverse().find((e) => e.direction === "inbound") ?? latest;
  const linked = emails.find((e) => e.company_id || e.contact_id || e.deal_id) ?? latest;

  await Promise.all(emails.filter((e) => !e.is_read).map((e) => markEmailRead(e.id)));

  // メール管理の利用タイプでは案件への紐付け・案件の作成を出さない
  const { sales } = await getFeatures();
  const [{ data: deals }, { data: companies }, { data: contacts }, { data: inquiry }, { data: members }, accounts, { data: allTags }] = await Promise.all([
    !sales
      ? Promise.resolve({ data: [] as { id: string; title: string }[] })
      : linked.company_id
        ? supabase.from("deals").select("id, title").eq("company_id", linked.company_id).order("updated_at", { ascending: false })
        : supabase.from("deals").select("id, title").not("stage", "in", '("won","lost")').order("updated_at", { ascending: false }).limit(50),
    supabase.from("companies").select("id, name").order("name"),
    supabase.from("contacts").select("id, name, company_id, email").order("name"),
    linked.inquiry_id ? supabase.from("inquiries").select("id, status, category").eq("id", linked.inquiry_id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from("members").select("id, name").eq("is_active", true).order("sort_order").order("created_at"),
    getMailAccountOptions(supabase),
    supabase.from("tags").select("*").order("sort_order").order("created_at"),
  ]);
  const selves = new Set(accounts.map((a) => a.email.toLowerCase()));
  // 返信の差出人は、このスレッドを受信したアカウント
  const threadAccountId = [...emails].reverse().find((e) => e.account_id)?.account_id ?? null;

  // 返信先。自社サイトのフォーム通知は差出人が通知システム(例: contact@mylogi.jp のグループ)なので、
  // 本文に書かれた問い合わせ者本人に返信する。通知の CC(CRM やチャットツールへの転送先)も引き継がない。
  const { counterpart, isForm } = resolveCounterpart({
    direction: latestInbound.direction,
    from: { address: latestInbound.from_address, name: latestInbound.from_name ?? "" },
    to: latestInbound.to_addresses.map((address) => ({ address, name: "" })),
    cc: latestInbound.cc_addresses.map((address) => ({ address, name: "" })),
    self: [...selves],
    text: latestInbound.text_body ?? "",
  });
  const replyTo =
    isForm && counterpart
      ? counterpart.address
      : latestInbound.direction === "inbound"
        ? latestInbound.from_address
        : latestInbound.to_addresses.join(", ");
  // CC は「全員に返信」と同じ: 相手のメールの宛先(自社のアカウント以外)と CC、その後こちらから送ったメールで足した CC を引き継ぐ。
  // 手動転送で届いたメールは宛先が転送の受け口アドレスなので外す
  const notOurs = (a: string) => !isInboundAddress(a);
  const since = emails.slice(emails.indexOf(latestInbound));
  const replyCc = isForm
    ? ""
    : uniqueAddresses(
        since.flatMap((m) => (m === latestInbound && m.direction === "inbound" ? [...m.to_addresses, ...m.cc_addresses] : m.cc_addresses)).filter(notOurs),
        [...selves, ...splitAddresses(replyTo)],
      ).join(", ");
  // CC に足せる候補: このスレッドのこれまでの差出人・宛先・CC と、相手のメールの本文に書かれたアドレス(「CC に入れてください」への対応)。
  // フォーム通知はヘッダーが通知システムと社内の転送先なので、本文のアドレスだけにする
  const contactNames = new Map((contacts ?? []).filter((c) => c.email).map((c) => [c.email!.toLowerCase(), c.name]));
  const addressOptions: AddressOption[] = [];
  const addOption = (email: string, name: string | null | undefined, hint: string) => {
    const key = email.trim().toLowerCase();
    if (!key.includes("@") || selves.has(key) || isInboundAddress(key) || addressOptions.some((o) => o.email.toLowerCase() === key)) return;
    addressOptions.push({ email: email.trim(), name: name?.trim() || contactNames.get(key) || null, hint });
  };
  const newestFirst = [...emails].reverse();
  // いちばん新しい相手のメールの本文に書かれたアドレスを先頭に出す
  if (latestInbound.direction === "inbound") for (const a of extractAddresses(latestInbound.text_body)) addOption(a, null, "本文に記載");
  if (!isForm) {
    for (const m of newestFirst) {
      addOption(m.from_address, m.from_name, "これまでの差出人");
      for (const a of m.to_addresses) addOption(a, null, "これまでの宛先");
      for (const a of m.cc_addresses) addOption(a, null, "これまでの CC");
    }
  }
  for (const m of newestFirst) {
    if (m.direction !== "inbound") continue;
    for (const a of extractAddresses(m.text_body)) addOption(a, null, "本文に記載");
  }
  const quote = buildQuote(fmtDateTime(latestInbound.received_at), latestInbound.from_name || latestInbound.from_address, latestInbound.text_body);
  // テンプレートの差し込み項目。相手の会社名・氏名はスレッドに紐付く取引先・担当者(フォーム通知なら本文の問い合わせ者)
  const merge: MergeVars = {
    取引先: linked.company?.name ?? "",
    担当者名: linked.contact?.name ?? (isForm ? counterpart?.name ?? "" : latestInbound.direction === "inbound" ? latestInbound.from_name ?? "" : ""),
    担当者メール: replyTo.split(",")[0]?.trim() ?? "",
    元の件名: latestInbound.subject ?? "",
    問い合わせ本文: quote,
    受信日時: fmtDateTime(latestInbound.received_at),
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/inbox"><ArrowLeft className="size-4" /> 受信トレイ</Link>
        </Button>
        <ThreadActions emailId={latest.id} hasInquiry={Boolean(linked.inquiry_id)} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="space-y-4 min-w-0">
          <h1 className="text-xl font-semibold">{latest.subject || "(件名なし)"}</h1>
          <ReplyForm replyToEmailId={latest.id} to={replyTo} cc={replyCc} quote={quote} accounts={accounts} defaultAccountId={threadAccountId} merge={merge} addressOptions={addressOptions} />
          {/* 履歴は新しいものが上。各メールはヘッダーをクリックして開閉できる */}
          {[...emails].reverse().map((e) => (
            <ThreadMessage
              key={e.id}
              direction={e.direction}
              fromName={e.from_name}
              fromAddress={e.from_address}
              to={e.to_addresses}
              cc={e.cc_addresses}
              receivedAt={fmtDateTime(e.received_at)}
              snippet={e.snippet}
              attachmentCount={e.attachments?.length ?? 0}
            >
              <EmailBody text={e.text_body} />
              <AttachmentList attachments={e.attachments ?? []} />
            </ThreadMessage>
          ))}
        </div>

        <aside className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-sm">関連情報</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-start gap-2">
                <Building2 className="size-4 mt-0.5 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">取引先</p>
                  {linked.company ? <Link href={`/companies/${linked.company.id}`} className="font-medium hover:underline">{linked.company.name}</Link> : <span className="text-muted-foreground">未登録</span>}
                </div>
              </div>
              <div className="flex items-start gap-2">
                <User className="size-4 mt-0.5 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">担当者</p>
                  {linked.contact ? <span className="font-medium">{linked.contact.name}</span> : <span className="text-muted-foreground">未登録</span>}
                </div>
              </div>
              <RelinkDialog emailId={latest.id} contacts={contacts ?? []} companies={companies ?? []} currentContactId={linked.contact_id ?? null} currentCompanyId={linked.company_id ?? null} />
              <ThreadTags emailId={latest.id} tags={(allTags ?? []) as Tag[]} current={threadTags} />
              {inquiry && (
                <div className="flex items-start gap-2">
                  <MessageSquareText className="size-4 mt-0.5 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">問い合わせ</p>
                    <Link href={`/inquiries?status=all&focus=${inquiry.id}#${inquiry.id}`} className="font-medium hover:underline">{inquiry.category ?? "問い合わせ"}</Link>
                  </div>
                </div>
              )}
              {sales && (
                <>
                  <Separator />
                  <div className="flex items-start gap-2">
                    <KanbanSquare className="size-4 mt-0.5 text-muted-foreground" />
                    <div className="min-w-0 flex-1 space-y-2">
                      <p className="text-xs text-muted-foreground">案件</p>
                      {linked.deal && (
                        <Link href={`/deals/${linked.deal.id}`} className="block font-medium hover:underline">{linked.deal.title}</Link>
                      )}
                      <LinkDealSelect emailId={latest.id} dealId={linked.deal_id} deals={deals ?? []} />
                      {!linked.deal_id && (
                        <NewDealDialog
                          companies={companies ?? []}
                          contacts={contacts ?? []}
                          members={members ?? []}
                          defaults={{
                            company_id: linked.company_id ?? undefined,
                            contact_id: linked.contact_id ?? undefined,
                            title: latest.subject ?? "",
                            inquiry_id: linked.inquiry_id ?? undefined,
                            email_id: latest.id,
                          }}
                          trigger={<Button size="sm" variant="secondary" className="w-full">このスレッドから案件を作成</Button>}
                        />
                      )}
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
