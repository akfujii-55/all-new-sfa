"use client";

import { useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { runMailSync } from "@/actions/emails";

export function MailSyncButton({ label = "メール同期" }: { label?: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          try {
            const results = await runMailSync();
            const inserted = results.reduce((a, r) => a + r.inserted, 0);
            const errors = results.filter((r) => r.error);
            if (errors.length) toast.error(`同期エラー: ${errors.map((e) => `${e.account} ${e.mailbox}: ${e.error}`).join(" / ")}`);
            else toast.success(`同期完了: ${inserted}件の新着メールを取り込みました`);
          } catch (e) {
            toast.error((e as Error).message);
          }
        })
      }
    >
      <RefreshCw className={pending ? "size-4 animate-spin" : "size-4"} />
      <span className="hidden sm:inline">{pending ? "同期中..." : label}</span>
    </Button>
  );
}
