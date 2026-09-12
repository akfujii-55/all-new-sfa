"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { syncTenantBillingNow } from "@/actions/admin";
import { Button } from "@/components/ui/button";

export function SyncBillingButton({ tenantId }: { tenantId: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm" variant="outline" disabled={pending}
      onClick={() =>
        start(async () => {
          try {
            await syncTenantBillingNow(tenantId);
            toast.success("Stripe の数量を同期しました(失敗した場合はシステムログに記録されます)");
          } catch (e) {
            toast.error((e as Error).message);
          }
        })
      }
    >
      <RefreshCw className="size-4" /> {pending ? "同期中..." : "今すぐ同期"}
    </Button>
  );
}
