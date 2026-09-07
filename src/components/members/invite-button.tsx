"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { MailPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { inviteMember } from "@/actions/members";

export function InviteButton({ memberId, resend }: { memberId: string; resend?: boolean }) {
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm" variant={resend ? "ghost" : "outline"} disabled={pending}
      onClick={() =>
        start(async () => {
          try { const r = await inviteMember(memberId); toast.success(r.message); }
          catch (e) { toast.error((e as Error).message); }
        })
      }
    >
      <MailPlus className="size-4" /> {pending ? "送信中..." : resend ? "再送" : "招待"}
    </Button>
  );
}
