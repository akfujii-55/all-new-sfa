"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { saveRevenues, type RevenueLine } from "@/actions/deals";
import { Button } from "@/components/ui/button";
import { RevenueLinesEditor } from "./revenue-lines-editor";
import type { Revenue } from "@/lib/types";

export function RevenueEditor({ dealId, revenues }: { dealId: string; revenues: Revenue[] }) {
  const [lines, setLines] = useState<RevenueLine[]>(
    revenues.length ? revenues.map((r) => ({ year_month: r.year_month, amount: Number(r.amount), memo: r.memo ?? "" })) : [{ year_month: "", amount: 0, memo: "" }],
  );
  const [pending, start] = useTransition();
  return (
    <div className="space-y-3">
      <RevenueLinesEditor lines={lines} onChange={setLines} />
      <div className="flex justify-end">
        <Button
          size="sm"
          disabled={pending}
          onClick={() =>
            start(async () => {
              try {
                await saveRevenues(dealId, lines);
                toast.success("売上明細を保存しました");
              } catch (e) {
                toast.error((e as Error).message);
              }
            })
          }
        >
          保存
        </Button>
      </div>
    </div>
  );
}
