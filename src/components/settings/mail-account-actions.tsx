"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { PlugZap, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setDefaultMailAccount, testMailAccount } from "@/actions/mail-accounts";

export function MailAccountActions({ id, isDefault }: { id: string; isDefault: boolean }) {
  const [pending, start] = useTransition();
  return (
    <div className="flex items-center gap-1">
      <Button
        size="sm" variant="ghost" disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await testMailAccount(id);
            if (r.ok) toast.success("IMAP / SMTP に接続できました");
            else toast.error(r.error);
          })
        }
      >
        <PlugZap className="size-4" /> 接続テスト
      </Button>
      {!isDefault && (
        <Button
          size="sm" variant="ghost" disabled={pending}
          onClick={() =>
            start(async () => {
              try { await setDefaultMailAccount(id); toast.success("既定の差出人にしました"); }
              catch (e) { toast.error((e as Error).message); }
            })
          }
        >
          <Star className="size-4" /> 既定にする
        </Button>
      )}
    </div>
  );
}
