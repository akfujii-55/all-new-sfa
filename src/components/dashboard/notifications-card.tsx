"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BellRing, Check } from "lucide-react";
import { toast } from "sonner";
import { markNotificationsRead } from "@/actions/notifications";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { actionErrorMessage } from "@/lib/errors";
import { fmtRelative } from "@/lib/format";
import { NOTIFICATION_KIND_LABEL } from "@/lib/notifications-shared";
import type { Notification } from "@/lib/types";

/**
 * ダッシュボードの「あなたへのお知らせ」(0036)。未読があるときだけ「今日やること」の上に出す。
 * 「開く」で既読にしてその画面へ、「既読」でその場で消す。全部既読になるとカードごと消える。
 */
export function NotificationsCard({ notifications }: { notifications: Notification[] }) {
  const router = useRouter();
  const [items, setItems] = useState(notifications);
  const [pending, start] = useTransition();
  if (items.length === 0) return null;

  function read(ids?: string[]) {
    start(async () => {
      try {
        await markNotificationsRead(ids);
        setItems((prev) => (ids ? prev.filter((p) => !ids.includes(p.id)) : []));
        router.refresh();
      } catch (e) {
        toast.error(actionErrorMessage(e));
      }
    });
  }

  return (
    <Card className="mt-6 border-primary/50">
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-base">
          <BellRing className="size-4" /> あなたへのお知らせ
          <Badge variant="secondary" className="h-5 px-1.5">{items.length}</Badge>
        </CardTitle>
        <Button variant="ghost" size="sm" disabled={pending} onClick={() => read()}>
          <Check className="size-4" /> すべて既読にする
        </Button>
      </CardHeader>
      <CardContent className="divide-y">
        {items.map((n) => (
          <div key={n.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 first:pt-0 last:pb-0">
            <span className="w-16 shrink-0 text-xs text-muted-foreground tabular-nums">{fmtRelative(n.created_at)}</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm">
                <span className="mr-1.5 rounded bg-secondary px-1 py-0.5 text-[10px] text-secondary-foreground">{NOTIFICATION_KIND_LABEL[n.kind]}</span>
                {n.title}
              </p>
              {n.body && <p className="truncate text-xs text-muted-foreground">{n.body}</p>}
            </div>
            <div className="flex gap-1.5">
              <Button asChild size="sm" variant="outline" className="h-7 px-2 text-xs">
                <Link href={n.href} onClick={() => markNotificationsRead([n.id]).catch(() => {})}>開く</Link>
              </Button>
              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={pending} onClick={() => read([n.id])}>既読</Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
