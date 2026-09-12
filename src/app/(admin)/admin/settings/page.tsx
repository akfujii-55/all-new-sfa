import { getPricingSettings, listOperators, requireOperator } from "@/actions/admin";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PricingForm } from "@/components/admin/pricing-form";
import { OperatorsForm } from "@/components/admin/operators-form";
import { ADMIN_UNLOCK_HOURS } from "@/lib/admin-gate";

export const metadata = { title: "設定 | 運営管理" };

export default async function AdminSettingsPage() {
  const [pricing, operators, { user }] = await Promise.all([getPricingSettings(), listOperators(), requireOperator()]);
  return (
    <div className="max-w-3xl space-y-4">
      <PageHeader title="設定" description="料金とオプション単価、新規テナントの既定値、運営者の管理。" />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">運営者</CardTitle>
          <CardDescription>運営管理に入れる利用者。通常のログインに加えて、アクセスコード(環境変数 ADMIN_ACCESS_CODE)の入力が必要です(解除は {ADMIN_UNLOCK_HOURS} 時間有効)。</CardDescription>
        </CardHeader>
        <CardContent><OperatorsForm operators={operators} currentUserId={user.id} /></CardContent>
      </Card>
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
