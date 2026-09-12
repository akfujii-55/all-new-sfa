"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { deleteTenant } from "@/actions/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function DeleteTenantButton({ tenantId, slug }: { tenantId: string; slug: string }) {
  const [confirm, setConfirm] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted-foreground">確認のため会社 ID(<code>{slug}</code>)を入力:</span>
      <Input className="w-48" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={slug} />
      <Button
        variant="destructive"
        size="sm"
        disabled={pending || confirm !== slug}
        onClick={() =>
          start(async () => {
            try {
              await deleteTenant(tenantId, confirm);
              toast.success("テナントを削除しました");
              router.push("/admin");
            } catch (e) {
              toast.error((e as Error).message);
            }
          })
        }
      >
        {pending ? "削除中..." : "このテナントを削除する"}
      </Button>
    </div>
  );
}
