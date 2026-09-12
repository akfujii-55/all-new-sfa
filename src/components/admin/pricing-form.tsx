"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { savePricingSettings } from "@/actions/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PricingSettings } from "@/lib/pricing";

const FIELDS: { key: keyof PricingSettings; label: string; hint?: string; step?: number }[] = [
  { key: "price_base_monthly", label: "月額基本料金", hint: "メールアカウント 1、ユーザー 1、容量 1GB を含む" },
  { key: "price_per_extra_mail_account", label: "メールアカウント 1 件追加", hint: "円/月" },
  { key: "price_per_extra_user", label: "ユーザー 1 名追加", hint: "円/月" },
  { key: "price_per_extra_storage_gb", label: "容量 1GB 追加", hint: "円/月。0 なら無料扱い" },
  { key: "trial_days", label: "お試し期間(日)", hint: "新規テナントの既定値" },
  { key: "default_max_users", label: "既定のユーザー数上限" },
  { key: "default_max_mail_accounts", label: "既定のメールアカウント数上限" },
  { key: "default_max_storage_gb", label: "既定の容量上限(GB)", step: 0.1 },
];

export function PricingForm({ pricing }: { pricing: PricingSettings }) {
  const [pending, start] = useTransition();
  return (
    <form
      className="grid gap-3"
      action={(fd) =>
        start(async () => {
          try {
            await savePricingSettings(fd);
            toast.success("保存しました");
          } catch (e) {
            toast.error((e as Error).message);
          }
        })
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {FIELDS.map((f) => (
          <div key={f.key} className="grid gap-1.5">
            <Label htmlFor={f.key}>{f.label}</Label>
            <Input id={f.key} name={f.key} type="number" min={0} step={f.step ?? 1} defaultValue={pricing[f.key]} required />
            {f.hint && <p className="text-xs text-muted-foreground">{f.hint}</p>}
          </div>
        ))}
      </div>
      <div className="flex justify-end"><Button type="submit" size="sm" disabled={pending}>{pending ? "保存中..." : "保存"}</Button></div>
    </form>
  );
}
