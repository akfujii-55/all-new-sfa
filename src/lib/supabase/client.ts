import { createBrowserClient } from "@supabase/ssr";
import { TENANT_COOKIE, tenantHeaders } from "@/lib/tenant-select";

/** 選択中のテナントの Cookie(テナントの切り替えはページを読み込み直すので、作り直しは不要) */
function selectedTenant(): string | null {
  if (typeof document === "undefined") return null;
  const hit = document.cookie.split("; ").find((c) => c.startsWith(`${TENANT_COOKIE}=`));
  return hit ? decodeURIComponent(hit.slice(TENANT_COOKIE.length + 1)) : null;
}

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: tenantHeaders(selectedTenant()) } },
  );
}
