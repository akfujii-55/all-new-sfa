"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { updateInquiryStatus } from "@/actions/inquiries";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { INQUIRY_STATUS_LABEL, type InquiryStatus } from "@/lib/types";

import { actionErrorMessage } from "@/lib/errors";
import { useFeatures } from "@/components/layout/features-provider";
export function InquiryStatusSelect({ id, status }: { id: string; status: InquiryStatus }) {
  const [pending, start] = useTransition();
  // メール管理の利用タイプでは「案件化」を選ばせない(すでに案件化の問い合わせは表示だけ残す)
  const { sales } = useFeatures();
  return (
    <Select
      value={status}
      disabled={pending}
      onValueChange={(v) =>
        start(async () => {
          try { await updateInquiryStatus(id, v as InquiryStatus); } catch (e) { toast.error(actionErrorMessage(e)); }
        })
      }
    >
      <SelectTrigger size="sm" className="w-28"><SelectValue /></SelectTrigger>
      <SelectContent>
        {(Object.keys(INQUIRY_STATUS_LABEL) as InquiryStatus[]).filter((k) => sales || k !== "converted" || status === "converted").map((k) => (
          <SelectItem key={k} value={k}>{INQUIRY_STATUS_LABEL[k]}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
