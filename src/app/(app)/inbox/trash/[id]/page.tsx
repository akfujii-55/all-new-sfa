import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Building2, Trash2, User } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { EmailBody } from "@/components/inbox/email-body";
import { AttachmentList } from "@/components/inbox/attachment-list";
import { ThreadMessage } from "@/components/inbox/thread-message";
import { TrashThreadActions } from "@/components/inbox/trash-thread-actions";
import { fmtDateTime, fmtMailTime } from "@/lib/format";
import { trashDaysLeft } from "@/lib/trash";
import type { EmailAttachment, EmailTrashRow } from "@/lib/types";

export const metadata = { title: "ゴミ箱のメール" };

/**
 * ゴミ箱に入っているスレッドの内容を確認する(読むだけ。返信・紐付け・タグの変更はできない)。
 * 通常の emails は RLS が削除済みを隠すので、ビュー email_trash から読む。添付は email_attachments を email_id で引く。
 */
export default async function TrashThreadPage({ params }: PageProps<"/inbox/trash/[id]">) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: root } = await supabase.from("email_trash").select("thread_key").eq("id", id).maybeSingle();
  if (!root) notFound();

  const { data } = await supabase
    .from("email_trash")
    .select("*, company:companies(id,name), contact:contacts(id,name)")
    .eq("thread_key", root.thread_key)
    .order("received_at", { ascending: true });
  const emails = (data ?? []) as unknown as EmailTrashRow[];
  if (emails.length === 0) notFound();

  const { data: atts } = await supabase
    .from("email_attachments")
    .select("*")
    .in("email_id", emails.map((e) => e.id))
    .order("created_at", { ascending: true });
  const attachmentsByEmail = new Map<string, EmailAttachment[]>();
  for (const a of (atts ?? []) as EmailAttachment[]) {
    const list = attachmentsByEmail.get(a.email_id) ?? [];
    list.push(a);
    attachmentsByEmail.set(a.email_id, list);
  }

  const latest = emails[emails.length - 1];
  const linked = emails.find((e) => e.company_id || e.contact_id) ?? latest;
  const left = trashDaysLeft(latest.deleted_at);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/inbox/trash"><ArrowLeft className="size-4" /> ゴミ箱</Link>
        </Button>
        <TrashThreadActions threadKey={latest.thread_key} emailId={latest.id} count={emails.length} subject={latest.subject} />
      </div>

      <div className="space-y-4 min-w-0">
        <div className="flex items-start gap-2 rounded-lg border border-amber-300/70 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          <Trash2 className="mt-0.5 size-4 shrink-0" />
          <p>
            このスレッドはゴミ箱にあります({latest.deleted_by_name ? `${latest.deleted_by_name} さんが ` : ""}{fmtMailTime(latest.deleted_at)} に削除)。
            {left === 0 ? "まもなく自動的に完全に削除されます。" : `あと ${left} 日で自動的に完全に削除されます。`}
            返信や紐付けの変更をするには「元に戻す」を押してください。
          </p>
        </div>

        <h1 className="text-xl font-semibold">{latest.subject || "(件名なし)"}</h1>

        <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Building2 className="size-4" />
            {linked.company ? <Link href={`/companies/${linked.company.id}`} className="font-medium text-foreground hover:underline">{linked.company.name}</Link> : "取引先: 未登録"}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <User className="size-4" />
            {linked.contact ? <span className="font-medium text-foreground">{linked.contact.name}</span> : "担当者: 未登録"}
          </span>
        </div>

        {/* 履歴は新しいものが上。通常のスレッド画面と同じ見た目で、本文と添付だけを見せる */}
        {[...emails].reverse().map((e) => (
          <ThreadMessage
            key={e.id}
            direction={e.direction}
            fromName={e.from_name}
            fromAddress={e.from_address}
            to={e.to_addresses}
            cc={e.cc_addresses ?? []}
            receivedAt={fmtDateTime(e.received_at)}
            snippet={e.snippet}
            attachmentCount={attachmentsByEmail.get(e.id)?.length ?? 0}
          >
            <EmailBody text={e.text_body} />
            <AttachmentList attachments={attachmentsByEmail.get(e.id) ?? []} />
          </ThreadMessage>
        ))}
      </div>
    </div>
  );
}
