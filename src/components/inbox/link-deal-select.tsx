"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { linkEmailThreadToDeal } from "@/actions/emails";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function LinkDealSelect({ emailId, dealId, deals }: { emailId: string; dealId: string | null; deals: { id: string; title: string }[] }) {
  const [pending, start] = useTransition();
  return (
    <Select
      value={dealId ?? "none"}
      disabled={pending}
      onValueChange={(v) =>
        start(async () => {
          try {
            await linkEmailThreadToDeal(emailId, v === "none" ? null : v);
            toast.success("案件への紐付けを更新しました");
          } catch (e) {
            toast.error((e as Error).message);
          }
        })
      }
    >
      <SelectTrigger className="w-full">
        <SelectValue placeholder="案件を選択" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">紐付けなし</SelectItem>
        {deals.map((d) => (
          <SelectItem key={d.id} value={d.id}>{d.title}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
