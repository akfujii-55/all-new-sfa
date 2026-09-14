"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { updateInquiryOwner } from "@/actions/inquiries";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Member } from "@/lib/types";

import { actionErrorMessage } from "@/lib/errors";
const NONE = "__none__";

/** 問い合わせの担当者(自社の営業担当)。付けると「新規」は「対応中」に進む */
export function InquiryOwnerSelect({ id, ownerId, members }: { id: string; ownerId: string | null; members: Pick<Member, "id" | "name">[] }) {
  const [pending, start] = useTransition();
  return (
    <Select
      value={ownerId ?? NONE}
      disabled={pending}
      onValueChange={(v) =>
        start(async () => {
          try {
            const r = await updateInquiryOwner(id, v === NONE ? null : v);
            if (v !== NONE && r.status === "in_progress") toast.success("担当者を設定し、「対応中」にしました");
          } catch (e) {
            toast.error(actionErrorMessage(e));
          }
        })
      }
    >
      <SelectTrigger size="sm" className="w-32" aria-label="担当者"><SelectValue placeholder="担当者" /></SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>担当者なし</SelectItem>
        {members.map((m) => (
          <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
