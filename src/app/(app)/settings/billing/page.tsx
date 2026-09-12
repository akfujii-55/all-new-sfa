import Link from "next/link";
import { ArrowLeft, CheckCircle2, AlertTriangle } from "lucide-react";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { getCurrentTenant } from "@/lib/supabase/tenant";
import { getMyUsage, tenantAccess, trialDaysLeft as calcTrialDaysLeft } from "@/lib/tenant-quota";
import { fmtGb, monthlyFee, pricingFromRows, TAX_PERCENT, withTax } from "@/lib/pricing";
import { stripeConfigured } from "@/lib/stripe";
import { fmtDate, fmtDateTime, yen } from "@/lib/format";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BillingPortalButton, CheckoutResult, StartCheckoutButton } from "@/components/settings/billing-actions";
import { BILLING_STATUS_LABEL, TENANT_STATUS_LABEL } from "@/lib/types";

export const metadata = { title: "ご契約・お支払い" };

export default async function BillingPage({ searchParams }: PageProps<"/settings/billing">) {
  const sp = await searchParams;
  const checkout = typeof sp.checkout === "string" ? sp.checkout : null;
  const sessionId = typeof sp.session_id === "string" ? sp.session_id : null;

  const supabase = await createClient();
  const [tenant, usage, { data: pricingRows }] = await Promise.all([
    getCurrentTenant(supabase),
    getMyUsage(supabase),
    // 料金は運営側の設定(全テナント共通)なので service role で読む
    createAdminClient().from("operator_settings").select("key, value"),
  ]);
  if (!tenant) return null;
  const pricing = pricingFromRows(pricingRows as { key: string; value: string }[] | null);
  const fee = monthlyFee(usage, pricing);
  const tax = withTax(fee.total);
  const access = tenantAccess(tenant);
  const configured = stripeConfigured();
  const subscribed = Boolean(tenant.stripe_subscription_id) && tenant.billing_status !== "cancelled";
  const trialDaysLeft = calcTrialDaysLeft(tenant);

  return (
    <div className="max-w-3xl">
      <CheckoutResult checkout={checkout} sessionId={sessionId} />
      <Link href="/settings" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> 設定</Link>
      <PageHeader
        title="ご契約・お支払い"
        description="契約状態、月額料金、お支払い方法の登録・変更。"
        actions={
          <div className="flex items-center gap-2">
            <Badge>{TENANT_STATUS_LABEL[tenant.status]}</Badge>
            <Badge variant="outline">{BILLING_STATUS_LABEL[tenant.billing_status]}</Badge>
          </div>
        }
      />

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">契約状態</CardTitle>
            <CardDescription>
              {tenant.status === "trial" && !subscribed && trialDaysLeft !== null && trialDaysLeft > 0 && `お試し期間はあと ${trialDaysLeft} 日(${fmtDateTime(tenant.trial_ends_at)} まで)です。期間中にお支払い方法を登録すると、お試し終了日から自動的に課金が始まり、そのまま使い続けられます。`}
              {tenant.status === "trial" && subscribed && `お支払い方法は登録済みです。お試し期間(${fmtDateTime(tenant.trial_ends_at)} まで)が終わると自動的に課金が始まります。`}
              {tenant.status === "trial" && !subscribed && trialDaysLeft !== null && trialDaysLeft <= 0 && "お試し期間が終了しました。引き続き利用するにはお支払い方法を登録してください。登録するまではデータの閲覧のみ可能です。"}
              {tenant.status === "active" && subscribed && `ご契約中です。次回のご請求は ${tenant.current_period_end ? fmtDate(tenant.current_period_end) : "-"} の予定です。`}
              {tenant.status === "active" && !subscribed && "ご契約中です(請求は運営から個別にご案内しています)。"}
              {tenant.status === "cancelled" && "解約済みです。データの閲覧のみ可能です。再開するにはお支払い方法を登録してください。"}
              {tenant.status === "suspended" && "利用停止中です。運営にお問い合わせください。"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {tenant.billing_status === "past_due" && (
              <p className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                <span>お支払いが確認できていません。「お支払い方法・請求書を管理」からカード情報をご確認ください。未払いのままだと利用が停止されます。</span>
              </p>
            )}
            {tenant.cancel_at_period_end && subscribed && (
              <p className="rounded-md border p-3 text-muted-foreground">
                {tenant.current_period_end ? fmtDate(tenant.current_period_end) : "期間末"} で解約する予定になっています。解約を取り消す場合は「お支払い方法・請求書を管理」から行えます。
              </p>
            )}
            {!configured ? (
              <p className="rounded-md border border-dashed p-3 text-muted-foreground">オンラインでのお支払い登録は準備中です。ご契約については運営までお問い合わせください。</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {!subscribed && tenant.status !== "suspended" && <StartCheckoutButton label={tenant.status === "cancelled" ? "お支払い方法を登録して再開する" : undefined} />}
                {tenant.stripe_customer_id && <BillingPortalButton />}
              </div>
            )}
            {subscribed && (
              <p className="flex items-center gap-1 text-xs text-muted-foreground"><CheckCircle2 className="size-3 text-emerald-500" /> お支払い方法の変更、請求書・領収書のダウンロード、解約は「お支払い方法・請求書を管理」から行えます。</p>
            )}
            {!access.writable && <p className="text-xs text-destructive">{access.reason}</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">月額料金</CardTitle>
            <CardDescription>
              現在の利用数から計算した金額です。基本料金にはメールアカウント 1 件・ユーザー 1 名・容量 1GB が含まれ、超えた分がオプション料金になります。
              利用数が変わると次回のご請求から反映されます(月の途中の変更は日割りです)。
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm">
            <table className="w-full">
              <tbody>
                {fee.items.map((i) => (
                  <tr key={i.label} className={i.qty === 0 ? "text-muted-foreground" : ""}>
                    <td className="py-1">{i.label}</td>
                    <td className="py-1 text-right tabular-nums">{i.label === "基本料金" ? "" : `${i.qty} × ${yen(i.unit)}`}</td>
                    <td className="py-1 text-right tabular-nums">{yen(i.amount)}</td>
                  </tr>
                ))}
                <tr className="border-t">
                  <td className="pt-2">小計(税抜)</td>
                  <td />
                  <td className="pt-2 text-right tabular-nums">{yen(tax.net)}</td>
                </tr>
                <tr>
                  <td className="py-0.5">消費税({TAX_PERCENT}%)</td>
                  <td />
                  <td className="py-0.5 text-right tabular-nums">{yen(tax.tax)}</td>
                </tr>
                <tr className="border-t font-medium">
                  <td className="pt-2">合計(月額・税込)</td>
                  <td />
                  <td className="pt-2 text-right tabular-nums">{yen(tax.gross)}</td>
                </tr>
              </tbody>
            </table>
            <p className="mt-3 text-xs text-muted-foreground">
              ご利用状況: ログインユーザー {usage.users} / {tenant.max_users} 名(招待中を含む) · 連携メールアカウント {usage.mail_accounts} / {tenant.max_mail_accounts} 件 · 使用容量 {fmtGb(usage.storage_bytes)} / {fmtGb(tenant.max_storage_bytes)}。
              上限の変更は運営までお問い合わせください。
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
