"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deleteOldSystemLogs } from "@/actions/settings";

export function DeleteOldLogsButton({ days = 30 }: { days?: number }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline" size="sm" disabled={pending}
      onClick={() =>
        start(async () => {
          try {
            const r = await deleteOldSystemLogs(days);
            toast.success(`${days} 日より前のログを ${r.deleted} 件削除しました`);
          } catch (e) {
            toast.error((e as Error).message);
          }
        })
      }
    >
      <Trash2 className="size-4" /> {days} 日より前を削除
    </Button>
  );
}
