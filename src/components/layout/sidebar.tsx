"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Inbox, MessageSquareText, Building2, Users, UserCog, KanbanSquare, JapaneseYen, Settings, ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

const NAV = [
  { href: "/", label: "ダッシュボード", icon: LayoutDashboard },
  { href: "/inbox", label: "メール", icon: Inbox, badgeKey: "unread" as const },
  { href: "/inquiries", label: "問い合わせ", icon: MessageSquareText, badgeKey: "inquiries" as const },
  { href: "/deals", label: "案件", icon: KanbanSquare },
  { href: "/companies", label: "取引先", icon: Building2 },
  { href: "/contacts", label: "担当者", icon: Users },
  { href: "/members", label: "営業担当者", icon: UserCog },
  { href: "/revenue", label: "売上", icon: JapaneseYen },
  { href: "/settings", label: "設定", icon: Settings },
];

export function Sidebar({ counts, isOperator = false }: { counts: { unread: number; inquiries: number }; isOperator?: boolean }) {
  const pathname = usePathname();
  return (
    <aside className="hidden md:flex w-60 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground">
      <Link href="/" className="flex h-14 items-center gap-2.5 px-4 border-b">
        <Image src="/art-logo-mark.png" alt="" width={30} height={30} priority className="size-[30px] shrink-0" />
        <span className="flex flex-col gap-1">
          {/* ワードマークは黒文字のため、ダークモードでは白に反転する */}
          <Image src="/art-logo-wordmark.png" alt="ART TRADING" width={100} height={12} priority className="h-3 w-auto dark:brightness-0 dark:invert" />
          <span className="text-[10px] font-semibold leading-none tracking-[0.3em] text-muted-foreground">SFA</span>
        </span>
      </Link>
      <nav className="flex-1 p-3 space-y-1">
        {NAV.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const badge = item.badgeKey ? counts[item.badgeKey] : 0;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
              )}
            >
              <item.icon className="size-4" />
              <span className="flex-1">{item.label}</span>
              {badge > 0 && <Badge variant="secondary" className="h-5 px-1.5 text-xs">{badge}</Badge>}
            </Link>
          );
        })}
      </nav>
      {isOperator && (
        <div className="border-t p-3">
          <Link href="/admin" className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground">
            <ShieldCheck className="size-4" />
            <span className="flex-1">運営管理</span>
          </Link>
        </div>
      )}
    </aside>
  );
}

export function MobileNav() {
  const pathname = usePathname();
  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t bg-background grid grid-cols-6">
      {NAV.slice(0, 6).map((item) => {
        const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn("flex flex-col items-center gap-0.5 py-2 text-[10px]", active ? "text-foreground" : "text-muted-foreground")}
          >
            <item.icon className="size-5" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
