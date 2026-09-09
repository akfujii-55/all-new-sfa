"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown, Paperclip } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface Props {
  direction: "inbound" | "outbound";
  fromName: string | null;
  fromAddress: string;
  to: string[];
  cc: string[];
  receivedAt: string; // 整形済みの表示文字列
  snippet: string | null;
  attachmentCount?: number;
  defaultOpen?: boolean;
  children: ReactNode; // 本文(サーバー側で描画)
}

// スレッド内の1通。ヘッダー全体がクリック可能領域で、マウスオンで背景をハイライトし、クリックで本文を開閉する
export function ThreadMessage({ direction, fromName, fromAddress, to, cc, receivedAt, snippet, attachmentCount = 0, defaultOpen = true, children }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card className={cn("gap-0 py-0", direction === "outbound" && "ring-emerald-200 dark:ring-emerald-900")}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={cn(
          "group/msg flex w-full cursor-pointer items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/60 focus-visible:bg-accent/60 focus-visible:outline-none dark:hover:bg-accent/40",
          open ? "rounded-t-xl" : "rounded-xl",
        )}
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div className="min-w-0 text-sm">
              <span className="font-medium">{fromName || fromAddress}</span>
              {fromName && <span className="text-muted-foreground"> &lt;{fromAddress}&gt;</span>}
              <Badge variant={direction === "inbound" ? "secondary" : "outline"} className="ml-2">
                {direction === "inbound" ? "受信" : "送信"}
              </Badge>
            </div>
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {attachmentCount > 0 && (
                <span className="inline-flex items-center gap-0.5" title={`添付ファイル ${attachmentCount}件`}>
                  <Paperclip className="size-3.5" />{attachmentCount}
                </span>
              )}
              {receivedAt}
            </span>
          </div>
          {open ? (
            <p className="mt-1 text-xs text-muted-foreground">
              To: {to.join(", ")}{cc.length ? ` / CC: ${cc.join(", ")}` : ""}
            </p>
          ) : (
            <p className="mt-1 truncate text-xs text-muted-foreground">{snippet || "(本文なし)"}</p>
          )}
        </div>
        <ChevronDown
          className={cn(
            "mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-hover/msg:text-foreground",
            open && "rotate-180",
          )}
        />
      </button>
      {open && <div className="border-t px-4 py-4">{children}</div>}
    </Card>
  );
}
