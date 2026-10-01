import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { TENANT_COOKIE, tenantHeaders } from "@/lib/tenant-select";

/**
 * ログインユーザーのセッションで動くクライアント(Server Component / Server Action 用)。
 * 複数のテナントに入れる利用者(運営サポート)は、選択中のテナントをヘッダーで DB に伝える。読み書きできるのはそのテナントのデータだけ
 */
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: tenantHeaders(cookieStore.get(TENANT_COOKIE)?.value) },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Server Component からの呼び出しでは set できない(proxy で更新される)
          }
        },
      },
    },
  );
}

/** RLS をバイパスする管理クライアント(cron のメール同期など、サーバー内部処理専用) */
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
