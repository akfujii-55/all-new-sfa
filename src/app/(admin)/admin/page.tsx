import Link from "next/link";
import { Building2, Plus } from "lucide-react";
import { getPricingSettings, listTenantsWithUsage } from "@/actions/admin";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtDate, yen } from "@/lib/format";
import { fmtGb, monthlyFee } from "@/lib/pricing";
import { BILLING_STATUS_LABEL, TENANT_STATUS_LABEL, type BillingStatus, type TenantStatus } from "@/lib/types";

export const metadata = { title: "テナント一覧 | 運営管理" };

const STATUS_VARIANT: Record<TenantStatus, "default" | "secondary" | "outline" | "destructive"> = {
  trial: "secondary",
  active: "default",
  suspended: "destructive",
  cancelled: "outline",
};
const BILLING_VARIANT: Record<BillingStatus, "default" | "secondary" | "outline" | "destructive"> = {
  none: "outline",
  trialing: "secondary",
  active: "default",
  past_due: "destructive",
  cancelled: "outline",
};

export default async function AdminTenantsPage() {
  const [tenants, pricing] = await Promise.all([listTenantsWithUsage(), getPricingSettings()]);
  const totalMonthly = tenants.filter((t) => !t.is_self && t.billing_status === "active").reduce((a, t) => a + monthlyFee(t, pricing).total, 0);

  return (
    <div>
      <PageHeader
        title="テナント一覧"
        description={`${tenants.length} 社 / 課金中の月額合計 ${yen(totalMonthly)}(税抜)`}
        actions={<Button asChild size="sm"><Link href="/admin/tenants/new"><Plus className="size-4" /> テナントを作成</Link></Button>}
      />
      {tenants.length === 0 ? (
        <EmptyState icon={Building2} title="テナントがありません" action={<Button asChild size="sm"><Link href="/admin/tenants/new"><Plus className="size-4" /> テナントを作成</Link></Button>} />
      ) : (
        <div className="rounded-lg border bg-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>会社</TableHead>
                <TableHead>担当者</TableHead>
                <TableHead>契約</TableHead>
                <TableHead>課金</TableHead>
                <TableHead className="text-right">ユーザー</TableHead>
                <TableHead className="text-right">メールアカウント</TableHead>
                <TableHead className="text-right">容量</TableHead>
                <TableHead className="text-right">メール件数</TableHead>
                <TableHead className="text-right">月額</TableHead>
                <TableHead>お試し期限</TableHead>
                <TableHead>作成日</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tenants.map((t) => {
                const fee = monthlyFee(t, pricing).total;
                const over = (n: number, max: number) => (n >= max ? "text-destructive font-medium" : "");
                return (
                  <TableRow key={t.id}>
                    <TableCell>
                      <Link href={`/admin/tenants/${t.id}`} className="font-medium hover:underline">{t.name}</Link>
                      {t.is_self && <Badge variant="outline" className="ml-2">自社</Badge>}
                      <div className="text-xs text-muted-foreground"><code>{t.slug}</code></div>
                    </TableCell>
                    <TableCell className="text-sm">
                      <div>{t.contact_name ?? "-"}</div>
                      <div className="text-xs text-muted-foreground">{t.contact_email ?? ""}</div>
                    </TableCell>
                    <TableCell><Badge variant={STATUS_VARIANT[t.status]}>{TENANT_STATUS_LABEL[t.status]}</Badge></TableCell>
                    <TableCell><Badge variant={BILLING_VARIANT[t.billing_status]}>{BILLING_STATUS_LABEL[t.billing_status]}</Badge></TableCell>
                    <TableCell className={`text-right tabular-nums ${over(t.usage.users, t.max_users)}`}>{t.usage.users} / {t.max_users}</TableCell>
                    <TableCell className={`text-right tabular-nums ${over(t.usage.mail_accounts, t.max_mail_accounts)}`}>{t.usage.mail_accounts} / {t.max_mail_accounts}</TableCell>
                    <TableCell className={`text-right tabular-nums ${over(t.usage.storage_bytes, t.max_storage_bytes)}`}>{fmtGb(t.usage.storage_bytes)} / {fmtGb(t.max_storage_bytes)}</TableCell>
                    <TableCell className="text-right tabular-nums">{t.usage.emails.toLocaleString("ja-JP")}</TableCell>
                    <TableCell className="text-right tabular-nums">{t.is_self ? "-" : yen(fee)}</TableCell>
                    <TableCell className="text-sm">{t.status === "trial" ? fmtDate(t.trial_ends_at) : "-"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{fmtDate(t.created_at)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
