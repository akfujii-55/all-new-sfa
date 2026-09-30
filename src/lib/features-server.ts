import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { userError } from "@/lib/errors";
import { featuresOf, type Features } from "@/lib/features";

/** ログイン中のテナントで使える機能。同じリクエストの中では 1 回だけ読む(レイアウトとページの両方から呼んでよい) */
export const getFeatures = cache(async (): Promise<Features> => {
  const supabase = await createClient();
  const { data } = await supabase.from("tenants").select("usage_type").maybeSingle();
  return featuresOf(data);
});

/** 案件・売上のページの先頭で呼ぶ。メール管理のテナントはダッシュボードへ戻す */
export async function requireSalesPage(): Promise<void> {
  if (!(await getFeatures()).sales) redirect("/");
}

/** 案件・売上(と案件の行動)を作る Server Action の入口で呼ぶ。メール管理のテナントなら例外 */
export async function assertSalesEnabled(): Promise<void> {
  if (!(await getFeatures()).sales) throw userError("このアカウントは「メール管理」の利用タイプのため、案件・売上は使えません");
}
