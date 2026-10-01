"use client";

import { useTransition } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { toast } from "sonner";
import { switchTenant } from "@/actions/tenant-switch";
import { actionErrorMessage } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { TenantOption } from "@/lib/tenant-select";

/** 入れるテナントが 2 つ以上ある利用者(運営サポート)向けの切り替え。選ぶとそのテナントのダッシュボードを開く */
export function TenantSwitcher({ options, label }: { options: TenantOption[]; label?: string }) {
  const [pending, start] = useTransition();
  const current = options.find((o) => o.is_current);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="max-w-[16rem] gap-1.5" disabled={pending}>
          <span className="truncate">{pending ? "切り替え中..." : label ?? current?.name ?? "テナントを選ぶ"}</span>
          <ChevronsUpDown className="size-3.5 shrink-0 opacity-70" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">テナントを切り替え</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {options.map((o) => (
          <DropdownMenuItem
            key={o.id}
            onSelect={() =>
              start(async () => {
                try {
                  await switchTenant(o.id);
                  // 前のテナントの画面がブラウザに残らないよう、読み込み直す(router.push ではキャッシュが残る)
                  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
                  window.location.assign("/");
                } catch (e) {
                  toast.error(actionErrorMessage(e));
                }
              })
            }
          >
            <Check className={`size-4 ${o.is_current ? "" : "invisible"}`} />
            <span className="flex-1 truncate">{o.name}</span>
            <span className="text-xs text-muted-foreground">{o.is_home ? "所属" : "運営サポート"}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
