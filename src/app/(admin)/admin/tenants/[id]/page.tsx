import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getPricingSettings, getTenantWithUsage, listTenantMembers } from "@/actions/admin";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TenantContactForm } from "@/components/admin/tenant-contact-form";
import { TenantPlanForm } from "@/components/admin/tenant-plan-form";
import { DeleteTenantButton } from "@/components/admin/delete-tenant-button";
import { ResendInviteButton } from "@/components/admin/resend-invite-button";
import { fmtDate, fmtDateTime, yen } from "@/lib/format";
import { fmtGb, monthlyFee, TAX_PERCENT, withTax } from "@/lib/pricing";
import { BILLING_STATUS_LABEL, TENANT_STATUS_LABEL } from "@/lib/types";
import { stripeConfigured, stripeDashboardUrl } from "@/lib/stripe";
import { SyncBillingButton } from "@/components/admin/sync-billing-button";

export const metadata = { title: "テナント詳細 | 運営管理" };

export default async function TenantDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [tenant, pricing] = await Promise.all([getTenantWithUsage(id), getPricingSettings()]);
  if (!tenant) notFound();
  const members = await listTenantMembers(id);
  const fee = monthlyFee(tenant.usage, pricing);
  const u = tenant.usage;

  return (
    <div className="max-w-4xl">
      <Link href="/admin" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> テナント一覧</Link>
      <PageHeader
        title={tenant.name}
        description={`会社 ID: ${tenant.slug} / 作成 ${fmtDate(tenant.created_at)} / 経路: ${tenant.source === "signup" ? "Web 申し込み" : "運営が作成"}`}
        actions={
          <div className="flex items-center gap-2">
            <Badge>{TENANT_STATUS_LABEL[tenant.status]}</Badge>
            <Badge variant="outline">{BILLING_STATUS_LABEL[tenant.billing_status]}</Badge>
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">利用状況</CardTitle>
            <CardDescription>上限に達した項目は赤く表示されます。</CardDescription>
          </CardHeader>
          <CardContent className="text-sm">
            <dl className="grid grid-cols-2 gap-y-2">
              <dt className="text-muted-foreground">ログインユーザー</dt>
              <dd className={`tabular-nums ${u.users >= tenant.max_users ? "text-destructive font-medium" : ""}`}>{u.users} / {tenant.max_users} 名{u.pending_invites > 0 && <span className="text-muted-foreground">(招待中 {u.pending_invites})</span>}</dd>
              <dt className="text-muted-foreground">連携メールアカウント</dt>
              <dd className={`tabular-nums ${u.mail_accounts >= tenant.max_mail_accounts ? "text-destructive font-medium" : ""}`}>{u.mail_accounts} / {tenant.max_mail_accounts} 件</dd>
              <dt className="text-muted-foreground">使用容量</dt>
              <dd className={`tabular-nums ${u.storage_bytes >= tenant.max_storage_bytes ? "text-destructive font-medium" : ""}`}>{fmtGb(u.storage_bytes)} / {fmtGb(tenant.max_storage_bytes)}</dd>
              <dt className="text-muted-foreground">メール件数</dt>
              <dd className="tabular-nums">{u.emails.toLocaleString("ja-JP")} 件</dd>
              <dt className="text-muted-foreground">お試し期限</dt>
              <dd>{tenant.trial_ends_at ? fmtDateTime(tenant.trial_ends_at) : "-"}</dd>
              <dt className="text-muted-foreground">次回請求</dt>
              <dd>{tenant.current_period_end ? fmtDate(tenant.current_period_end) : "-"}</dd>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">月額(税抜)</CardTitle>
            <CardDescription>現在の利用数(ログインユーザー数・連携メールアカウント数・使用容量の GB 切り上げ)から計算した金額です。上限は利用できる枠で、料金には影響しません。単価は「料金・既定値」で変更できます。</CardDescription>
          </CardHeader>
          <CardContent className="text-sm">
            <table className="w-full">
              <tbody>
                {fee.items.map((i) => (
                  <tr key={i.label} className={i.qty === 0 ? "text-muted-foreground" : ""}>
                    <td className="py-0.5">{i.label}</td>
                    <td className="py-0.5 text-right tabular-nums">{i.label === "基本料金" ? "" : `${i.qty} × ${yen(i.unit)}`}</td>
                    <td className="py-0.5 text-right tabular-nums">{yen(i.amount)}</td>
                  </tr>
                ))}
                <tr className="border-t font-medium">
                  <td className="pt-1">合計(税抜)</td>
                  <td />
                  <td className="pt-1 text-right tabular-nums">{yen(fee.total)}</td>
                </tr>
                <tr className="text-muted-foreground">
                  <td className="pt-0.5">税込(消費税 {TAX_PERCENT}%)</td>
                  <td />
                  <td className="pt-0.5 text-right tabular-nums">{yen(withTax(fee.total).gross)}</td>
                </tr>
              </tbody>
            </table>
            {tenant.is_self ? <p className="mt-2 text-xs text-muted-foreground">自社のテナントのため課金対象外です。</p> : tenant.billing_status !== "active" && <p className="mt-2 text-xs text-muted-foreground">課金状態が「課金中」でないため、一覧の月額合計には含まれません。</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">契約・上限・課金状態</CardTitle>
            <CardDescription>停止中・解約・お試し期限切れのテナントは閲覧のみになり、登録・送信・同期ができなくなります。</CardDescription>
          </CardHeader>
          <CardContent><TenantPlanForm tenant={tenant} /></CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Stripe(オンライン決済)</CardTitle>
            <CardDescription>契約状態は Stripe の Webhook で自動更新されます。手で契約状態を変えるのは、Stripe を使わない請求(請求書払いなど)のときだけにしてください。</CardDescription>
          </CardHeader>
          <CardContent className="text-sm">
            {!stripeConfigured() ? (
              <p className="text-muted-foreground">STRIPE_SECRET_KEY が未設定のため、オンライン決済は無効です。</p>
            ) : (
              <dl className="grid grid-cols-[8rem_1fr] gap-y-2">
                <dt className="text-muted-foreground">顧客</dt>
                <dd>{tenant.stripe_customer_id ? <a className="underline" href={stripeDashboardUrl(`customers/${tenant.stripe_customer_id}`)} target="_blank" rel="noreferrer">{tenant.stripe_customer_id}</a> : "未登録(お支払い方法が未登録)"}</dd>
                <dt className="text-muted-foreground">サブスクリプション</dt>
                <dd>{tenant.stripe_subscription_id ? <a className="underline" href={stripeDashboardUrl(`subscriptions/${tenant.stripe_subscription_id}`)} target="_blank" rel="noreferrer">{tenant.stripe_subscription_id}</a> : "なし"}{tenant.stripe_subscription_status && <span className="ml-2 text-muted-foreground">({tenant.stripe_subscription_status})</span>}</dd>
                <dt className="text-muted-foreground">次回請求</dt>
                <dd>{tenant.current_period_end ? fmtDate(tenant.current_period_end) : "-"}{tenant.cancel_at_period_end && <span className="ml-2 text-destructive">期間末で解約予定</span>}</dd>
                <dt className="text-muted-foreground">数量の同期</dt>
                <dd>{tenant.stripe_subscription_id ? <SyncBillingButton tenantId={tenant.id} /> : <span className="text-muted-foreground">契約後に利用数を Stripe へ自動反映します</span>}</dd>
              </dl>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">会社情報・連絡先</CardTitle>
            <CardDescription>運営メモはテナントの利用者には表示されません。</CardDescription>
          </CardHeader>
          <CardContent><TenantContactForm tenant={tenant} /></CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-base">利用者(営業担当者)</CardTitle>
          <CardDescription>ログインできる利用者と招待中の利用者。招待メールは運営側のメールアカウントから送られます。</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>氏名</TableHead>
                <TableHead>メール</TableHead>
                <TableHead>状態</TableHead>
                <TableHead className="w-40" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((m) => (
                <TableRow key={m.id} className={m.is_active ? "" : "text-muted-foreground"}>
                  <TableCell className="font-medium">{m.name}</TableCell>
                  <TableCell className="text-muted-foreground">{m.email ?? "-"}</TableCell>
                  <TableCell>
                    {m.profile_id ? <Badge variant="outline">ログイン可</Badge> : m.invited_at ? <Badge variant="secondary">招待中 {fmtDate(m.invited_at)}</Badge> : <Badge variant="outline">未招待</Badge>}
                  </TableCell>
                  <TableCell className="text-right">
                    {!m.profile_id && m.email && <ResendInviteButton tenantId={tenant.id} memberId={m.id} />}
                  </TableCell>
                </TableRow>
              ))}
              {members.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">利用者がいません</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="mt-4 border-destructive/40">
        <CardHeader>
          <CardTitle className="text-base">テナントの削除</CardTitle>
          <CardDescription>メール・案件・添付ファイルなどこの会社のデータをすべて削除します。元に戻せません。</CardDescription>
        </CardHeader>
        <CardContent><DeleteTenantButton tenantId={tenant.id} slug={tenant.slug} /></CardContent>
      </Card>
    </div>
  );
}
