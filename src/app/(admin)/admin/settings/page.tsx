import { getOperatorAlertSettings, getPricingSettings } from "@/actions/admin";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PricingForm } from "@/components/admin/pricing-form";
import { OperatorAlertForm } from "@/components/admin/operator-alert-form";

export const metadata = { title: "料金・既定値 | 運営管理" };

export default async function AdminSettingsPage() {
  const [pricing, alerts] = await Promise.all([getPricingSettings(), getOperatorAlertSettings()]);
  return (
    <div className="max-w-2xl">
      <PageHeader title="料金・既定値" description="月額料金とオプション単価、新規テナントの既定の上限とお試し期間、運営へのエラー通知先。" />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">料金(税抜・円/月)</CardTitle>
          <CardDescription>基本料金にはメールアカウント 1 件、ユーザー 1 名、容量 1GB が含まれます。超えた分はオプション単価 × 数で計算します。</CardDescription>
        </CardHeader>
        <CardContent><PricingForm pricing={pricing} /></CardContent>
      </Card>
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">エラー通知先(運営)</CardTitle>
          <CardDescription>
            システム全体のエラーと、各テナントで起きたエラーの控え(どのテナントで起きたかを件名に付けて)をここへ送ります。同じ発生箇所は 30 分に 1 回まで。
            新規申し込みの通知も同じ宛先です。各テナント自身のエラーは、そのテナントの設定画面の通知先にも届きます。
          </CardDescription>
        </CardHeader>
        <CardContent><OperatorAlertForm settings={alerts} /></CardContent>
      </Card>
    </div>
  );
}
