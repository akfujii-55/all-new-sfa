import { createAdminClient } from "@/lib/supabase/server";
import { pricingFromRows, TAX_PERCENT, withTax } from "@/lib/pricing";
import { yen } from "@/lib/format";
import { SignupForm } from "@/components/signup/signup-form";

export const metadata = { title: "お申し込み" };
export const dynamic = "force-dynamic";

export default async function SignupPage() {
  const { data } = await createAdminClient().from("operator_settings").select("key, value");
  const pricing = pricingFromRows(data as { key: string; value: string }[] | null);
  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="hidden lg:flex flex-col justify-between bg-zinc-950 text-white p-12">
        <div className="flex items-center gap-2 font-semibold text-lg">
          <span className="inline-flex size-8 items-center justify-center rounded-lg bg-white text-zinc-950 font-bold">S</span>
          SFA
        </div>
        <div className="space-y-6 max-w-md">
          <div className="space-y-3">
            <h1 className="text-3xl font-semibold leading-tight">まずは {pricing.trial_days} 日間、無料でお試しください。</h1>
            <p className="text-zinc-400">Gmail の問い合わせを取り込み、顧客・案件・売上までひとつの流れで管理します。</p>
          </div>
          <dl className="space-y-2 text-sm text-zinc-300">
            <div className="flex justify-between border-b border-zinc-800 pb-2"><dt>月額基本料金</dt><dd className="tabular-nums">{yen(pricing.price_base_monthly)}(税込 {yen(withTax(pricing.price_base_monthly).gross)})</dd></div>
            <div className="flex justify-between border-b border-zinc-800 pb-2"><dt className="text-zinc-400">含まれるもの</dt><dd className="text-zinc-400">メールアカウント 1 件 / ユーザー 1 名 / 容量 1GB</dd></div>
            <div className="flex justify-between border-b border-zinc-800 pb-2"><dt>ユーザー追加</dt><dd className="tabular-nums">+{yen(pricing.price_per_extra_user)} / 名</dd></div>
            <div className="flex justify-between border-b border-zinc-800 pb-2"><dt>メールアカウント追加</dt><dd className="tabular-nums">+{yen(pricing.price_per_extra_mail_account)} / 件</dd></div>
          </dl>
          <p className="text-xs text-zinc-500">表示価格は税抜です。ご請求時に消費税 {TAX_PERCENT}% を加算します。お試し期間終了後にご利用を続ける場合は、設定画面からお支払い方法(クレジットカード)を登録してください。料金は実際の利用数で毎月計算します。</p>
        </div>
        <p className="text-xs text-zinc-500">© {new Date().getFullYear()} SFA</p>
      </div>
      <div className="flex items-center justify-center p-6">
        <SignupForm trialDays={pricing.trial_days} />
      </div>
    </div>
  );
}
