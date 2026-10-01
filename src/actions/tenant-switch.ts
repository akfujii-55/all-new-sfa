"use server";

import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { userError } from "@/lib/errors";
import { TENANT_COOKIE, type TenantOption } from "@/lib/tenant-select";

/**
 * 入れる別のテナントに切り替える(選択を Cookie に覚える)。入れないテナントは選べない。
 * 画面側は成功したらページを読み込み直す(前のテナントの画面のキャッシュを残さないため redirect ではなく再読み込み)
 */
export async function switchTenant(tenantId: string): Promise<void> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw userError("ログインが必要です");
  const { data, error } = await supabase.rpc("my_tenants");
  if (error) throw userError(`テナントを確認できません: ${error.message}`);
  if (!((data ?? []) as TenantOption[]).some((t) => t.id === tenantId)) throw userError("このテナントには入れません");
  (await cookies()).set(TENANT_COOKIE, tenantId, {
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 365,
  });
}
