"use client";

import { useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CreditCard, ExternalLink } from "lucide-react";
import { finalizeCheckout, openBillingPortal, startCheckout } from "@/actions/billing";
import { Button } from "@/components/ui/button";

function run(start: (fn: () => Promise<void>) => void, action: () => Promise<never>) {
  start(async () => {
    try {
      await action();
    } catch (e) {
      // redirect() は例外として伝わる。それ以外はエラー表示
      const msg = (e as Error)?.message ?? "";
      if (/NEXT_REDIRECT/.test(msg)) throw e;
      toast.error(msg || "処理に失敗しました");
    }
  });
}

export function StartCheckoutButton({ label = "お支払い方法を登録して契約する" }: { label?: string }) {
  const [pending, start] = useTransition();
  return (
    <Button disabled={pending} onClick={() => run(start, startCheckout)}>
      <CreditCard className="size-4" /> {pending ? "決済ページを開いています..." : label}
    </Button>
  );
}

export function BillingPortalButton({ label = "お支払い方法・請求書を管理" }: { label?: string }) {
  const [pending, start] = useTransition();
  return (
    <Button variant="outline" disabled={pending} onClick={() => run(start, openBillingPortal)}>
      <ExternalLink className="size-4" /> {pending ? "開いています..." : label}
    </Button>
  );
}

/** success_url で戻ってきたときに契約状態を反映し、URL のパラメータを消す */
export function CheckoutResult({ checkout, sessionId }: { checkout: string | null; sessionId: string | null }) {
  const router = useRouter();
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    if (checkout === "success" && sessionId) {
      finalizeCheckout(sessionId).then((r) => {
        if (r.ok) toast.success(r.message);
        else toast.error(r.message);
        router.replace("/settings/billing");
        router.refresh();
      });
    } else if (checkout === "cancel") {
      toast.info("お支払い方法の登録を中止しました");
      router.replace("/settings/billing");
    }
  }, [checkout, sessionId, router]);
  return null;
}
