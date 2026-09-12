"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Send } from "lucide-react";
import { resendTenantInvite } from "@/actions/admin";
import { Button } from "@/components/ui/button";

export function ResendInviteButton({ tenantId, memberId }: { tenantId: string; memberId: string }) {
  const [pending, start] = useTransition();
  const [link, setLink] = useState<string | null>(null);
  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() =>
          start(async () => {
            try {
              const r = await resendTenantInvite(tenantId, memberId);
              if (r.mailSent) toast.success("招待メールを送りました");
              else toast.error(`招待メールを送れませんでした(${r.mailError})。表示されたリンクを手動で送ってください`);
              setLink(r.inviteLink);
            } catch (e) {
              toast.error((e as Error).message);
            }
          })
        }
      >
        <Send className="size-4" /> {pending ? "送信中..." : "招待を送る"}
      </Button>
      {link && <code className="max-w-xs truncate text-[10px] text-muted-foreground" title={link}>{link}</code>}
    </div>
  );
}
