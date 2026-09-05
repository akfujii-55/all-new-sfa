"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { updateInquiryStatus } from "@/actions/inquiries";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { INQUIRY_STATUS_LABEL, type InquiryStatus } from "@/lib/types";

export function InquiryStatusSelect({ id, status }: { id: string; status: InquiryStatus }) {
  const [pending, start] = useTransition();
  return (
    <Select
      value={status}
      disabled={pending}
      onValueChange={(v) =>
        start(async () => {
          try { await updateInquiryStatus(id, v as InquiryStatus); } catch (e) { toast.error((e as Error).message); }
        })
      }
    >
      <SelectTrigger size="sm" className="w-28"><SelectValue /></SelectTrigger>
      <SelectContent>
        {(Object.keys(INQUIRY_STATUS_LABEL) as InquiryStatus[]).map((k) => (
          <SelectItem key={k} value={k}>{INQUIRY_STATUS_LABEL[k]}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
