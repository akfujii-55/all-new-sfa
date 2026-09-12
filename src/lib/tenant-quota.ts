import type { SupabaseClient } from "@supabase/supabase-js";
import { getCurrentTenant } from "@/lib/supabase/tenant";
import { fmtGb } from "@/lib/pricing";
import type { Tenant, TenantUsage } from "@/lib/types";

/**
 * テナントの利用可否と上限。
 * - 利用可否: status が suspended / cancelled、または trial の期限切れなら書き込み系の操作を止める(閲覧は可)。
 * - 上限: ユーザー数(招待時)、メールアカウント数(追加時)、容量(添付ファイル保存時)を tenants の値と比べる。
 * どちらもログインユーザーのクライアントで動く(tenants は自テナントの行だけ、利用量は my_tenant_usage())。
 */

export type TenantAccess = { writable: true } | { writable: false; reason: string };

export function tenantAccess(t: Pick<Tenant, "status" | "trial_ends_at" | "name">): TenantAccess {
  if (t.status === "suspended") return { writable: false, reason: "このアカウントは利用停止中です。運営にお問い合わせください。" };
  if (t.status === "cancelled") return { writable: false, reason: "このアカウントは解約済みです。データの閲覧のみ可能です。" };
  if (t.status === "trial" && t.trial_ends_at && Date.parse(t.trial_ends_at) < Date.now()) {
    return { writable: false, reason: "お試し期間が終了しました。引き続き利用するには契約手続きが必要です。運営にお問い合わせください。" };
  }
  return { writable: true };
}

export async function getMyUsage(db: SupabaseClient): Promise<TenantUsage> {
  const { data, error } = await db.rpc("my_tenant_usage").single();
  if (error) throw new Error(`利用量を取得できません: ${error.message}`);
  const u = data as Record<string, number | string>;
  return {
    users: Number(u.users ?? 0),
    pending_invites: Number(u.pending_invites ?? 0),
    mail_accounts: Number(u.mail_accounts ?? 0),
    emails: Number(u.emails ?? 0),
    storage_bytes: Number(u.storage_bytes ?? 0),
  };
}

async function requireTenant(db: SupabaseClient): Promise<Tenant> {
  const t = await getCurrentTenant(db);
  if (!t) throw new Error("所属する会社(テナント)を確認できません");
  return t;
}

/** 書き込み系の操作の入口で呼ぶ。停止中・解約・お試し期限切れなら例外 */
export async function assertTenantWritable(db: SupabaseClient): Promise<Tenant> {
  const t = await requireTenant(db);
  const a = tenantAccess(t);
  if (!a.writable) throw new Error(a.reason);
  return t;
}

/** 招待(ログインユーザーの追加)ができるか */
export async function assertCanAddUser(db: SupabaseClient) {
  const t = await assertTenantWritable(db);
  const u = await getMyUsage(db);
  if (u.users >= t.max_users) {
    throw new Error(`ログインユーザー数の上限(${t.max_users} 名、招待中を含む)に達しています。ユーザーを追加するには運営にお問い合わせください`);
  }
}

/** メールアカウントを追加できるか */
export async function assertCanAddMailAccount(db: SupabaseClient) {
  const t = await assertTenantWritable(db);
  const u = await getMyUsage(db);
  if (u.mail_accounts >= t.max_mail_accounts) {
    throw new Error(`連携メールアカウント数の上限(${t.max_mail_accounts} 件)に達しています。追加するには運営にお問い合わせください`);
  }
}

/** 指定バイト数を追加しても容量の上限内か。超えるなら例外 */
export async function assertStorageAvailable(db: SupabaseClient, extraBytes: number) {
  const t = await requireTenant(db);
  const u = await getMyUsage(db);
  if (u.storage_bytes + extraBytes > t.max_storage_bytes) {
    throw new Error(
      `使用容量の上限(${fmtGb(t.max_storage_bytes)})を超えるため保存できません(現在 ${fmtGb(u.storage_bytes)})。不要なメールを削除するか、運営に容量の追加をお問い合わせください`,
    );
  }
}
