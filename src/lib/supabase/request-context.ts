import { combineChunks, parseCookieHeader, stringFromBase64URL } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { TENANT_COOKIE, tenantHeaders } from "@/lib/tenant-select";

/** エラー記録に添える「誰が・どのテナントで」の情報 */
export interface RequestContext {
  userEmail: string | null;
  tenant: { id: string; name: string; slug: string } | null;
}

const EMPTY: RequestContext = { userEmail: null, tenant: null };

/**
 * リクエストの Cookie ヘッダーからログインユーザーとテナントを調べる(onRequestError 用)。
 * next/headers の cookies() が使えない場所で動かすので Cookie を自分で読む。
 * セッションの更新(リフレッシュ)は絶対にしない: ここでリフレッシュトークンを回すとブラウザ側の Cookie が古くなり、
 * 利用者がログアウトされてしまう。アクセストークンが期限切れなら諦めて空を返す。
 */
export async function requestContextFromCookies(cookieHeader: string | string[] | undefined): Promise<RequestContext> {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const header = Array.isArray(cookieHeader) ? cookieHeader.join("; ") : cookieHeader;
    if (!url || !anon || !header) return EMPTY;

    const cookies = new Map(parseCookieHeader(header).map((c) => [c.name, c.value]));
    const ref = new URL(url).hostname.split(".")[0];
    const raw = await combineChunks(`sb-${ref}-auth-token`, (name) => cookies.get(name) ?? null);
    if (!raw) return EMPTY;
    const json = raw.startsWith("base64-") ? stringFromBase64URL(raw.slice("base64-".length)) : raw;
    const token = (JSON.parse(json) as { access_token?: unknown }).access_token;
    if (typeof token !== "string" || !token) return EMPTY;

    const db = createSupabaseClient(url, anon, {
      // 選択中のテナント(運営サポートが別のテナントに入っているとき)も伝え、エラーをそのテナントのものとして記録する
      global: { headers: { Authorization: `Bearer ${token}`, ...tenantHeaders(cookies.get(TENANT_COOKIE)) } },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data: auth } = await db.auth.getUser(token);
    if (!auth.user) return EMPTY;
    // RLS で選択中のテナントしか見えないので、条件なしで 1 件取ればそのテナント
    const { data: tenant } = await db.from("tenants").select("id, name, slug").maybeSingle();
    return {
      userEmail: auth.user.email ?? null,
      tenant: tenant ? { id: tenant.id as string, name: tenant.name as string, slug: tenant.slug as string } : null,
    };
  } catch {
    return EMPTY;
  }
}
