"use client";

import { useState, useTransition } from "react";
import { applyUnsubscribe } from "@/actions/unsubscribe";
import { Button } from "@/components/ui/button";

export function UnsubscribeForm({ token, maskedEmail, tenantName, alreadyUnsubscribed }: { token: string; maskedEmail: string; tenantName: string; alreadyUnsubscribed: boolean }) {
  const [done, setDone] = useState(alreadyUnsubscribed);
  const [failed, setFailed] = useState(false);
  const [pending, start] = useTransition();

  if (done) {
    return (
      <div className="mt-3 space-y-2 text-sm">
        <p>{maskedEmail} あての {tenantName} からのご案内メールは停止されています。</p>
        <p className="text-muted-foreground">停止後も、個別のお問い合わせへの返信など業務上必要な連絡は届くことがあります。</p>
      </div>
    );
  }
  return (
    <div className="mt-3 space-y-4 text-sm">
      <p>
        {maskedEmail} あての {tenantName} からのご案内メールを停止します。
      </p>
      <Button
        disabled={pending}
        onClick={() =>
          start(async () => {
            const ok = await applyUnsubscribe(token);
            if (ok) setDone(true);
            else setFailed(true);
          })
        }
      >
        {pending ? "停止しています..." : "配信を停止する"}
      </Button>
      {failed && <p className="text-destructive">停止できませんでした。時間をおいて、メールのリンクからもう一度お試しください。</p>}
      <p className="text-xs text-muted-foreground">停止後も、個別のお問い合わせへの返信など業務上必要な連絡は届くことがあります。</p>
    </div>
  );
}
