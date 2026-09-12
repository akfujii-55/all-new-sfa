import { getPricingSettings } from "@/actions/admin";
import { PageHeader } from "@/components/layout/page-header";
import { TenantCreateForm } from "@/components/admin/tenant-create-form";

export const metadata = { title: "テナントを作成 | 運営管理" };

export default async function NewTenantPage() {
  const pricing = await getPricingSettings();
  return (
    <div className="max-w-2xl">
      <PageHeader title="テナントを作成" description="会社と最初の管理者を登録し、招待メールを送ります。上限は後から変更できます。" />
      <TenantCreateForm pricing={pricing} />
    </div>
  );
}
