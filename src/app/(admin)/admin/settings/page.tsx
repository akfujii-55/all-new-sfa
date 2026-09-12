import { getPricingSettings } from "@/actions/admin";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PricingForm } from "@/components/admin/pricing-form";

export const metadata = { title: "料金・既定値 | 運営管理" };

export default async function AdminSettingsPage() {
  const pricing = await getPricingSettings();
  return (
    <div className="max-w-2xl">
      <PageHeader title="料金・既定値" description="月額料金とオプション単価、新規テナントの既定の上限とお試し期間。" />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">料金(税抜・円/月)</CardTitle>
          <CardDescription>基本料金にはメールアカウント 1 件、ユーザー 1 名、容量 1GB が含まれます。超えた分はオプション単価 × 数で計算します。</CardDescription>
        </CardHeader>
        <CardContent><PricingForm pricing={pricing} /></CardContent>
      </Card>
    </div>
  );
}
