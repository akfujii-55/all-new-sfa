import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fmtRelative } from "@/lib/format";
import type { Email, Inquiry } from "@/lib/types";

/** ダッシュボード下段の「最近の問い合わせ」「最近の受信メール」。営業支援・メール管理のどちらの利用タイプでも出す */
export function RecentLists({ inquiries, mails }: { inquiries: Inquiry[]; mails: Email[] }) {
  return (
    <div className="mt-6 grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">最近の問い合わせ</CardTitle>
          <Button asChild variant="ghost" size="sm">
            <Link href="/inquiries">すべて <ArrowRight className="size-4" /></Link>
          </Button>
        </CardHeader>
        <CardContent className="divide-y">
          {inquiries.length ? (
            inquiries.map((q) => (
              <div key={q.id} className="flex items-start justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <Link href={`/inquiries?status=all&focus=${q.id}#${q.id}`} className="font-medium text-sm hover:underline line-clamp-1">
                    {q.subject}
                  </Link>
                  <p className="text-xs text-muted-foreground line-clamp-1">
                    {q.company?.name ?? "-"}{q.contact ? ` / ${q.contact.name}` : ""}{q.owner ? ` · 担当: ${q.owner.name}` : ""}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  {q.category && <Badge variant="secondary">{q.category}</Badge>}
                  <p className="text-xs text-muted-foreground mt-1">{fmtRelative(q.received_at)}</p>
                </div>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">問い合わせはまだありません</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">最近の受信メール</CardTitle>
          <Button asChild variant="ghost" size="sm">
            <Link href="/inbox">受信トレイ <ArrowRight className="size-4" /></Link>
          </Button>
        </CardHeader>
        <CardContent className="divide-y">
          {mails.length ? (
            mails.map((m) => (
              <div key={m.id} className="flex items-start justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <Link href={`/inbox/${m.id}`} className={`text-sm hover:underline line-clamp-1 ${m.is_read ? "" : "font-semibold"}`}>
                    {m.subject || "(件名なし)"}
                  </Link>
                  <p className="text-xs text-muted-foreground line-clamp-1">{m.from_name || m.from_address}{m.company ? ` · ${m.company.name}` : ""}</p>
                </div>
                <p className="text-xs text-muted-foreground shrink-0">{fmtRelative(m.received_at)}</p>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">
              メールはまだありません。右上の「メール同期」で連携したメールアカウントから取り込みます。
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
