import { createHmac } from "node:crypto";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "./server";
import type { Tenant } from "@/lib/types";

/**
 * マルチテナントの土台。
 *
 * - ログインユーザーのクライアント(createClient)は RLS が profiles.tenant_id で自動的に自テナントに絞る。
 * - ログインユーザーが居ない処理(cron の同期・ヘルスチェック)は createTenantClient(tenantId) で
 *   「tenant_id クレーム付きの authenticated トークン」を持つクライアントを作り、RLS を通して同じコードを動かす。
 * - service role(createAdminClient)は RLS を通らないので、業務テーブルの読み書きには使わない。
 *   使ってよいのは auth.admin、Storage の実体操作、tenants の一覧、tenant_id が null のシステムログ程度。
 */

const tenantIdCache = new WeakMap<SupabaseClient, string>();

function b64url(s: string) {
  return Buffer.from(s).toString("base64url");
}

/** Supabase の JWT シークレット(HS256)で署名したトークンを作る */
function signTenantToken(tenantId: string, secret: string) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64url(
    JSON.stringify({
      role: "authenticated",
      aud: "authenticated",
      iss: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1`,
      iat: now,
      exp: now + 60 * 60,
      tenant_id: tenantId,
    }),
  );
  const sig = createHmac("sha256", secret).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${sig}`;
}

export function hasTenantClientSupport() {
  return Boolean(process.env.SUPABASE_JWT_SECRET);
}

/**
 * 指定テナントとして動くクライアント(サーバー内部専用)。RLS が tenant_id クレームでそのテナントに絞る。
 * SUPABASE_JWT_SECRET(Supabase の Project Settings → JWT Keys → Legacy JWT Secret)が必要。
 */
export function createTenantClient(tenantId: string): SupabaseClient {
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) {
    throw new Error(
      "SUPABASE_JWT_SECRET が設定されていません。Supabase の Project Settings → JWT Keys → Legacy JWT Secret の値を環境変数に登録してください",
    );
  }
  const token = signTenantToken(tenantId, secret);
  const client = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    accessToken: async () => token,
    auth: { persistSession: false, autoRefreshToken: false },
  });
  tenantIdCache.set(client, tenantId);
  return client;
}

/** クライアントが属するテナント ID。ログインユーザーのクライアントは DB(current_tenant_id)に問い合わせて確定する */
export async function tenantIdOf(db: SupabaseClient): Promise<string> {
  const cached = tenantIdCache.get(db);
  if (cached) return cached;
  const { data, error } = await db.rpc("current_tenant_id");
  if (error) throw new Error(`テナントを特定できません: ${error.message}`);
  if (!data) throw new Error("このユーザーはどの会社(テナント)にも所属していません。管理者に招待を依頼してください");
  tenantIdCache.set(db, data as string);
  return data as string;
}

/** ログインユーザーの所属テナント。未所属なら null */
export async function getCurrentTenant(db: SupabaseClient): Promise<Tenant | null> {
  const { data } = await db.from("tenants").select("*").maybeSingle();
  return (data as Tenant | null) ?? null;
}

/** 有効なテナント(お試し中・契約中)を作成順で返す。service role 専用 */
export async function listActiveTenants(): Promise<Tenant[]> {
  const { data, error } = await createAdminClient()
    .from("tenants")
    .select("*")
    .in("status", ["trial", "active"])
    .order("created_at");
  if (error) throw new Error(`テナント一覧の取得に失敗しました: ${error.message}`);
  return (data ?? []) as Tenant[];
}

/**
 * 運営側(最初に作られたテナント=自社)のクライアント。
 * テナントに属さないシステムログの通知メールなどに使う。JWT シークレット未設定なら null
 */
export async function operatorTenantClient(): Promise<SupabaseClient | null> {
  if (!hasTenantClientSupport()) return null;
  const { data } = await createAdminClient().from("tenants").select("id").order("created_at").limit(1).maybeSingle();
  return data ? createTenantClient(data.id as string) : null;
}
