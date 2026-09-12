"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { updateTenantPlan } from "@/actions/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BILLING_STATUS_LABEL, GIB, TENANT_STATUS_LABEL, type BillingStatus, type Tenant, type TenantStatus } from "@/lib/types";

/** `<input type="date">` 用に日本時間の yyyy-MM-dd にする */
function toDateInput(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
}

export function TenantPlanForm({ tenant }: { tenant: Tenant }) {
  const [pending, start] = useTransition();
  return (
    <form
      className="grid gap-3"
      action={(fd) =>
        start(async () => {
          try {
            await updateTenantPlan(tenant.id, fd);
            toast.success("保存しました");
          } catch (e) {
            toast.error((e as Error).message);
          }
        })
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="status">契約状態</Label>
          <select id="status" name="status" defaultValue={tenant.status} className="h-9 rounded-md border bg-background px-2 text-sm">
            {(Object.keys(TENANT_STATUS_LABEL) as TenantStatus[]).map((k) => <option key={k} value={k}>{TENANT_STATUS_LABEL[k]}</option>)}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="billing_status">課金状態</Label>
          <select id="billing_status" name="billing_status" defaultValue={tenant.billing_status} className="h-9 rounded-md border bg-background px-2 text-sm">
            {(Object.keys(BILLING_STATUS_LABEL) as BillingStatus[]).map((k) => <option key={k} value={k}>{BILLING_STATUS_LABEL[k]}</option>)}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="max_users">ユーザー数の上限</Label>
          <Input id="max_users" name="max_users" type="number" min={1} defaultValue={tenant.max_users} required />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="max_mail_accounts">メールアカウント数の上限</Label>
          <Input id="max_mail_accounts" name="max_mail_accounts" type="number" min={1} defaultValue={tenant.max_mail_accounts} required />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="max_storage_gb">容量の上限(GB)</Label>
          <Input id="max_storage_gb" name="max_storage_gb" type="number" min={0.1} step={0.1} defaultValue={Math.round((tenant.max_storage_bytes / GIB) * 10) / 10} required />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="trial_ends_at">お試し期限(この日の終わりまで)</Label>
          <Input id="trial_ends_at" name="trial_ends_at" type="date" defaultValue={toDateInput(tenant.trial_ends_at)} />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Stripe 連携後は課金状態と次回請求日を Webhook で自動更新します。それまでは手動で管理してください。</p>
      <div className="flex justify-end"><Button type="submit" size="sm" disabled={pending}>{pending ? "保存中..." : "保存"}</Button></div>
    </form>
  );
}
