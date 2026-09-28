"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bell, Check } from "lucide-react";
import { toast } from "sonner";
import { listNotifications, markNotificationsRead } from "@/actions/notifications";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { actionErrorMessage } from "@/lib/errors";
import { fmtRelative } from "@/lib/format";
import { NOTIFICATION_KIND_LABEL } from "@/lib/notifications-shared";
import type { Notification } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * ヘッダーの通知ベル(0036)。未読の数を出し、開くと自分あてのお知らせを新しい順に並べる。
 * 項目を押すと既読にしてその画面へ移る。件数はレイアウトがサーバーで数えて渡す(画面遷移のたびに更新)。
 */
export function NotificationBell({ unread: initialUnread }: { unread: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(initialUnread);
  const [items, setItems] = useState<Notification[] | null>(null);
  const [pending, start] = useTransition();

  function load() {
    start(async () => {
      try {
        const rows = await listNotifications();
        setItems(rows);
        setUnread(rows.filter((r) => !r.read_at).length);
      } catch (e) {
        toast.error(actionErrorMessage(e));
      }
    });
  }

  function openItem(n: Notification) {
    setOpen(false);
    if (!n.read_at) {
      setItems((prev) => prev?.map((p) => (p.id === n.id ? { ...p, read_at: new Date().toISOString() } : p)) ?? null);
      setUnread((c) => Math.max(0, c - 1));
      markNotificationsRead([n.id]).catch(() => {});
    }
    router.push(n.href);
  }

  function readAll() {
    start(async () => {
      try {
        await markNotificationsRead();
        setItems((prev) => prev?.map((p) => (p.read_at ? p : { ...p, read_at: new Date().toISOString() })) ?? null);
        setUnread(0);
        router.refresh();
      } catch (e) {
        toast.error(actionErrorMessage(e));
      }
    });
  }

  return (
    <Popover
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v) load();
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={unread > 0 ? `お知らせ(未読 ${unread} 件)` : "お知らせ"}>
          <Bell className="size-4" />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-white">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(22rem,calc(100vw-1.5rem))] p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-medium">お知らせ</span>
          <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" disabled={pending || unread === 0} onClick={readAll}>
            <Check className="size-3" /> すべて既読にする
          </Button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto">
          {items === null ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">読み込み中…</p>
          ) : items.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">お知らせはありません。担当者に付けられると、ここに届きます。</p>
          ) : (
            <ul className="divide-y">
              {items.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => openItem(n)}
                    className={cn("grid w-full grid-cols-[10px_1fr] gap-2 px-3 py-2.5 text-left hover:bg-accent", n.read_at && "text-muted-foreground")}
                  >
                    <span className={cn("mt-1.5 size-2 rounded-full", n.read_at ? "bg-transparent" : "bg-primary")} aria-hidden />
                    <span className="min-w-0">
                      <span className={cn("block text-sm leading-snug", !n.read_at && "font-medium")}>
                        <span className="mr-1.5 rounded bg-secondary px-1 py-0.5 text-[10px] font-normal text-secondary-foreground">{NOTIFICATION_KIND_LABEL[n.kind]}</span>
                        {n.title}
                      </span>
                      {n.body && <span className="block truncate text-xs">{n.body}</span>}
                      <span className="block text-xs">{fmtRelative(n.created_at)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
