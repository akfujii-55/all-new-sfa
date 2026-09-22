import Link from "next/link";
import { ArrowLeft, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { TrashList, type TrashThread } from "@/components/inbox/trash-list";
import { TRASH_RETENTION_DAYS } from "@/lib/mail/trash";
import type { EmailTrashRow } from "@/lib/types";

export const metadata = { title: "ゴミ箱" };

/** メールのゴミ箱。削除したスレッドを TRASH_RETENTION_DAYS 日間見せ、元に戻す・今すぐ完全に削除ができる */
export default async function InboxTrashPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("email_trash")
    .select("id, thread_key, direction, from_address, from_name, to_addresses, subject, snippet, received_at, deleted_at, deleted_by_name, company:companies(id,name)")
    .order("deleted_at", { ascending: false })
    .order("received_at", { ascending: false })
    .limit(1000);
  const rows = (data ?? []) as unknown as EmailTrashRow[];

  // スレッド単位で最新 1 件にまとめる(削除日時は同じスレッドなら同時なので先頭のもの)
  const threads: TrashThread[] = [];
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.thread_key, (counts.get(r.thread_key) ?? 0) + 1);
  const seen = new Set<string>();
  for (const r of rows) {
    if (seen.has(r.thread_key)) continue;
    seen.add(r.thread_key);
    threads.push({
      id: r.id,
      thread_key: r.thread_key,
      direction: r.direction,
      from_address: r.from_address,
      from_name: r.from_name,
      to_addresses: r.to_addresses,
      subject: r.subject,
      snippet: r.snippet,
      received_at: r.received_at,
      deleted_at: r.deleted_at,
      deleted_by_name: r.deleted_by_name,
      company: r.company ?? null,
      count: counts.get(r.thread_key) ?? 1,
    });
  }

  return (
    <div>
      <PageHeader
        title="ゴミ箱"
        description={`削除したメールは ${TRASH_RETENTION_DAYS} 日間ここに残り、その後自動で完全に削除されます。元に戻すと、紐付け・タグ・添付ファイルも削除前のまま戻ります。`}
        actions={
          <Button asChild size="sm" variant="outline">
            <Link href="/inbox"><ArrowLeft className="size-4" /> メール一覧に戻る</Link>
          </Button>
        }
      />
      {threads.length === 0 ? (
        <EmptyState icon={Trash2} title="ゴミ箱は空です" description="メール一覧で削除したスレッドがここに入ります。" />
      ) : (
        <TrashList threads={threads} />
      )}
    </div>
  );
}
