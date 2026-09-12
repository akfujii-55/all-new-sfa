"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { operatorTenantClient } from "@/lib/supabase/tenant";
import { resolveSendAccount } from "@/lib/mail/accounts";
import { sendMail } from "@/lib/mail/smtp";
import { DEFAULT_MAIL_TEMPLATES, MAIL_TEMPLATE_KEYS, loadMailTemplate, buildMail, validateTemplate, type MailTemplate, type MailTemplateKey } from "@/lib/mail/templates";
import { errorMessage } from "@/lib/log";
import { PRICING_KEYS, pricingFromRows, type PricingSettings } from "@/lib/pricing";
import { GIB, type BillingStatus, type Tenant, type TenantStatus, type TenantUsage } from "@/lib/types";

/**
 * 運営管理(/admin)の Server Actions。
 * 運営者(operators)だけが実行でき、テナント横断のため service role で読み書きする。
 * 業務データ(メール・案件など)には触らず、tenants / operator_settings / members(招待)だけを扱う。
 */

/** ログインユーザーが運営者であることを確認し、service role クライアントを返す */
export async function requireOperator() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("ログインが必要です");
  const admin = createAdminClient();
  const { data: op } = await admin.from("operators").select("user_id, is_super").eq("user_id", auth.user.id).maybeSingle();
  if (!op) throw new Error("運営者のみ操作できます");
  return { admin, user: auth.user, isSuper: Boolean(op.is_super) };
}

/** スーパーユーザー(運営者の招待・削除ができる)であることを確認する */
async function requireSuperOperator() {
  const ctx = await requireOperator();
  if (!ctx.isSuper) throw new Error("この操作はスーパーユーザーのみ行えます");
  return ctx;
}

function s(v: FormDataEntryValue | null) {
  const t = String(v ?? "").trim();
  return t === "" ? null : t;
}
function int(v: FormDataEntryValue | null, min: number, label: string) {
  const n = Number(String(v ?? "").trim());
  if (!Number.isInteger(n) || n < min) throw new Error(`${label}は ${min} 以上の整数で入力してください`);
  return n;
}
function gbToBytes(v: FormDataEntryValue | null) {
  const n = Number(String(v ?? "").trim());
  if (!Number.isFinite(n) || n <= 0) throw new Error("容量は 0 より大きい数(GB)で入力してください");
  return Math.round(n * GIB);
}

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;

// ---------- 運営者(ユーザー管理) ----------

export interface OperatorRow {
  user_id: string;
  email: string | null;
  full_name: string | null;
  is_super: boolean;
  /** 招待済みでまだログインしていない */
  pending: boolean;
  note: string | null;
  created_at: string;
}

export async function listOperators(): Promise<OperatorRow[]> {
  const { admin } = await requireOperator();
  const { data } = await admin.from("operators").select("user_id, name, note, is_super, created_at").order("is_super", { ascending: false }).order("created_at");
  const ids = (data ?? []).map((o) => o.user_id as string);
  const { data: profiles } = ids.length ? await admin.from("profiles").select("id, email, full_name").in("id", ids) : { data: [] };
  const byId = new Map((profiles ?? []).map((p) => [p.id as string, p]));
  const rows: OperatorRow[] = [];
  for (const o of data ?? []) {
    const uid = o.user_id as string;
    const { data: u } = await admin.auth.admin.getUserById(uid);
    rows.push({
      user_id: uid,
      email: (byId.get(uid)?.email as string | null) ?? u.user?.email ?? null,
      full_name: (o.name as string | null) ?? (byId.get(uid)?.full_name as string | null) ?? null,
      is_super: Boolean(o.is_super),
      pending: !u.user?.last_sign_in_at,
      note: (o.note as string | null) ?? null,
      created_at: o.created_at as string,
    });
  }
  return rows;
}

export interface InviteOperatorResult {
  inviteLink: string;
  mailSent: boolean;
  mailError: string | null;
}

/**
 * 運営者をメールで招待する(スーパーユーザーのみ)。
 * 運営専用のアカウント(どのテナントにも所属しない)を作り、招待リンクでパスワードを設定してもらう。
 * テナントの利用者として登録済みのメールアドレスは使えない(運営とテナント利用を分けるため)。
 */
export async function inviteOperator(formData: FormData): Promise<InviteOperatorResult> {
  const { admin, user } = await requireSuperOperator();
  const email = s(formData.get("email"))?.toLowerCase();
  const name = s(formData.get("name"));
  if (!email || !email.includes("@")) throw new Error("メールアドレスを入力してください");
  if (!name) throw new Error("氏名を入力してください");
  const note = s(formData.get("note"));

  const { data: existing } = await admin.from("profiles").select("id, tenant_id").ilike("email", email).maybeSingle();
  let userId: string | null = existing?.id ?? null;
  let tokenHash: string;
  let type: "invite" | "magiclink";

  if (existing?.tenant_id) {
    throw new Error("このメールアドレスはテナントの利用者として登録されています。運営者は運営専用のメールアドレスで招待してください");
  }
  if (userId) {
    // 招待済みで未ログインの運営者への再送
    const again = await admin.auth.admin.generateLink({ type: "magiclink", email });
    if (again.error) throw new Error(again.error.message);
    tokenHash = again.data.properties.hashed_token;
    type = "magiclink";
  } else {
    // 運営専用アカウント(operator=true)。handle_new_user はテナントに所属させない
    const first = await admin.auth.admin.generateLink({
      type: "invite",
      email,
      options: { data: { full_name: name, operator: "true" } },
    });
    if (first.error) throw new Error(first.error.message);
    tokenHash = first.data.properties.hashed_token;
    type = "invite";
    userId = first.data.user.id;
  }

  const { error } = await admin.from("operators").upsert({ user_id: userId, name, note, is_super: false }, { onConflict: "user_id" });
  if (error) throw new Error(error.message);

  const origin = await siteOrigin();
  const inviteLink = `${origin}/auth/confirm?token_hash=${encodeURIComponent(tokenHash)}&type=${type}&next=${encodeURIComponent(type === "invite" ? "/set-password" : "/admin")}`;

  let mailSent = false;
  let mailError: string | null = null;
  try {
    const operator = await operatorTenantClient();
    if (!operator) throw new Error("SUPABASE_JWT_SECRET が未設定のため運営側のメールアカウントを使えません");
    const account = await resolveSendAccount(operator, {});
    const { data: opTenant } = await admin.from("tenants").select("name").order("created_at").limit(1).maybeSingle();
    const mail = await buildMail("operator_invite", { name, company: opTenant?.name ?? "", inviter: user.email ?? "", link: inviteLink });
    await sendMail(account, { to: [email], subject: mail.subject, text: mail.text });
    mailSent = true;
  } catch (e) {
    mailError = errorMessage(e);
  }
  revalidatePath("/admin/users");
  return { inviteLink, mailSent, mailError };
}

/** 運営者を削除する(スーパーユーザーのみ)。運営専用アカウントはログインごと削除する。スーパーユーザーは削除できない */
export async function removeOperator(userId: string): Promise<void> {
  const { admin, user } = await requireSuperOperator();
  if (userId === user.id) throw new Error("スーパーユーザー自身は削除できません");
  const { data: target } = await admin.from("operators").select("is_super").eq("user_id", userId).maybeSingle();
  if (!target) throw new Error("運営者が見つかりません");
  if (target.is_super) throw new Error("スーパーユーザーは削除できません");
  const { error } = await admin.from("operators").delete().eq("user_id", userId);
  if (error) throw new Error(error.message);
  // どのテナントにも所属しない運営専用アカウントなら、auth ユーザーも消してログインできなくする
  const { data: profile } = await admin.from("profiles").select("tenant_id").eq("id", userId).maybeSingle();
  if (!profile?.tenant_id) {
    const { error: delErr } = await admin.auth.admin.deleteUser(userId);
    if (delErr && !/not found/i.test(delErr.message)) throw new Error(`ログインの削除に失敗しました: ${delErr.message}`);
  }
  revalidatePath("/admin/users");
}

// ---------- メールテンプレート ----------

export interface MailTemplateRow extends MailTemplate {
  key: MailTemplateKey;
  /** 既定文面から変更されているか */
  customized: boolean;
  updated_at: string | null;
}

export async function listMailTemplates(): Promise<MailTemplateRow[]> {
  const { admin } = await requireOperator();
  const { data } = await admin.from("mail_templates").select("key, subject, body, updated_at");
  const byKey = new Map((data ?? []).map((r) => [r.key as MailTemplateKey, r]));
  return MAIL_TEMPLATE_KEYS.map((key) => {
    const row = byKey.get(key);
    return row
      ? { key, subject: row.subject as string, body: row.body as string, customized: true, updated_at: row.updated_at as string }
      : { key, ...DEFAULT_MAIL_TEMPLATES[key], customized: false, updated_at: null };
  });
}

export async function saveMailTemplate(key: MailTemplateKey, formData: FormData): Promise<void> {
  const { admin } = await requireOperator();
  if (!MAIL_TEMPLATE_KEYS.includes(key)) throw new Error("テンプレートの種類が不正です");
  const t: MailTemplate = {
    subject: String(formData.get("subject") ?? "").replace(/\r\n/g, "\n").trim(),
    body: String(formData.get("body") ?? "").replace(/\r\n/g, "\n").trim(),
  };
  const err = validateTemplate(t);
  if (err) throw new Error(err);
  const { error } = await admin.from("mail_templates").upsert({ key, ...t }, { onConflict: "key" });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/mail-templates");
}

/** 既定の文面に戻す(保存した行を消す) */
export async function resetMailTemplate(key: MailTemplateKey): Promise<void> {
  const { admin } = await requireOperator();
  const { error } = await admin.from("mail_templates").delete().eq("key", key);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/mail-templates");
}

/** 現在の文面(保存済みか既定)。プレビュー用 */
export async function getMailTemplate(key: MailTemplateKey): Promise<MailTemplate> {
  await requireOperator();
  return loadMailTemplate(key);
}

// ---------- 参照 ----------

export async function getPricingSettings(): Promise<PricingSettings> {
  const { admin } = await requireOperator();
  const { data } = await admin.from("operator_settings").select("key, value");
  return pricingFromRows(data);
}

export interface TenantWithUsage extends Tenant {
  usage: TenantUsage;
  /** 運営側のテナント(最初に作られた自社)。課金対象外 */
  is_self: boolean;
}

export async function listTenantsWithUsage(): Promise<TenantWithUsage[]> {
  const { admin } = await requireOperator();
  const [{ data: tenants, error }, { data: usage }] = await Promise.all([
    admin.from("tenants").select("*").order("created_at"),
    admin.from("tenant_usage").select("*"),
  ]);
  if (error) throw new Error(error.message);
  const byId = new Map((usage ?? []).map((u) => [u.tenant_id as string, u]));
  return ((tenants ?? []) as Tenant[]).map((t, i) => ({ ...t, usage: toUsage(byId.get(t.id)), is_self: i === 0 }));
}

export async function getTenantWithUsage(id: string): Promise<TenantWithUsage | null> {
  const { admin } = await requireOperator();
  const [{ data: tenant }, { data: usage }] = await Promise.all([
    admin.from("tenants").select("*").eq("id", id).maybeSingle(),
    admin.from("tenant_usage").select("*").eq("tenant_id", id).maybeSingle(),
  ]);
  if (!tenant) return null;
  const { data: first } = await admin.from("tenants").select("id").order("created_at").limit(1).single();
  return { ...(tenant as Tenant), usage: toUsage(usage), is_self: first?.id === id };
}

function toUsage(u: Record<string, unknown> | null | undefined): TenantUsage {
  return {
    users: Number(u?.users ?? 0),
    pending_invites: Number(u?.pending_invites ?? 0),
    mail_accounts: Number(u?.mail_accounts ?? 0),
    emails: Number(u?.emails ?? 0),
    storage_bytes: Number(u?.storage_bytes ?? 0),
  };
}

/** テナントの利用者(営業担当者)一覧。招待状況の確認と再送に使う */
export async function listTenantMembers(tenantId: string) {
  const { admin } = await requireOperator();
  const { data } = await admin
    .from("members")
    .select("id, name, email, profile_id, invited_at, is_active, created_at")
    .eq("tenant_id", tenantId)
    .order("created_at");
  return (data ?? []) as { id: string; name: string; email: string | null; profile_id: string | null; invited_at: string | null; is_active: boolean; created_at: string }[];
}

// ---------- 料金・既定値 ----------

export async function savePricingSettings(formData: FormData) {
  const { admin } = await requireOperator();
  const rows = PRICING_KEYS.map((key) => {
    const n = Number(String(formData.get(key) ?? "").trim());
    if (!Number.isFinite(n) || n < 0) throw new Error(`${key} は 0 以上の数で入力してください`);
    return { key, value: String(n) };
  });
  const { error } = await admin.from("operator_settings").upsert(rows, { onConflict: "key" });
  if (error) throw new Error(error.message);
  revalidatePath("/admin", "layout");
}

// ---------- テナントの作成 ----------

export interface CreateTenantResult {
  id: string;
  inviteLink: string;
  /** 招待メールを送れたか。送れなかった場合はリンクを手動で送る */
  mailSent: boolean;
  mailError: string | null;
}

export async function createTenant(formData: FormData): Promise<CreateTenantResult> {
  const { admin } = await requireOperator();
  const name = s(formData.get("name"));
  const slug = s(formData.get("slug"))?.toLowerCase() ?? null;
  const ownerName = s(formData.get("contact_name"));
  const ownerEmail = s(formData.get("contact_email"))?.toLowerCase() ?? null;
  if (!name) throw new Error("会社名を入力してください");
  if (!slug || !SLUG_RE.test(slug)) throw new Error("会社 ID は英小文字・数字・ハイフンで 3〜40 文字(先頭と末尾は英数字)にしてください");
  if (!ownerEmail || !ownerEmail.includes("@")) throw new Error("担当者のメールアドレスを入力してください");

  const { data: tenantId, error } = await admin.rpc("create_tenant", {
    p_name: name,
    p_slug: slug,
    p_owner_name: ownerName ?? "",
    p_owner_email: ownerEmail,
    p_contact_phone: s(formData.get("contact_phone")),
    p_address: s(formData.get("address")),
    p_max_users: int(formData.get("max_users"), 1, "ユーザー数の上限"),
    p_max_mail_accounts: int(formData.get("max_mail_accounts"), 1, "メールアカウント数の上限"),
    p_max_storage_bytes: gbToBytes(formData.get("max_storage_gb")),
    p_trial_days: int(formData.get("trial_days"), 0, "お試し期間"),
    p_source: "operator",
  });
  if (error) {
    if (error.code === "23505") throw new Error("この会社 ID は既に使われています");
    throw new Error(error.message);
  }
  const note = s(formData.get("note"));
  if (note) await admin.from("tenants").update({ note }).eq("id", tenantId);

  const { data: member } = await admin.from("members").select("id").eq("tenant_id", tenantId).order("created_at").limit(1).single();
  const invite = await issueInvite(tenantId as string, member!.id as string);
  revalidatePath("/admin", "layout");
  return { id: tenantId as string, ...invite };
}

/**
 * 招待リンクを発行し、運営側テナントのメールアカウントから送る。
 * 新しいテナントにはまだメールアカウントが無いので、テナント自身の SMTP は使えない。
 */
async function issueInvite(tenantId: string, memberId: string): Promise<Omit<CreateTenantResult, "id">> {
  const admin = createAdminClient();
  const [{ data: tenant }, { data: member }] = await Promise.all([
    admin.from("tenants").select("name").eq("id", tenantId).single(),
    admin.from("members").select("id, name, email, profile_id").eq("id", memberId).eq("tenant_id", tenantId).single(),
  ]);
  if (!member?.email) throw new Error("招待先のメールアドレスがありません");
  if (member.profile_id) throw new Error("この利用者は既にログインできます");
  const email = (member.email as string).toLowerCase();

  let tokenHash: string | null = null;
  let type: "invite" | "magiclink" = "invite";
  const first = await admin.auth.admin.generateLink({
    type: "invite",
    email,
    options: { data: { full_name: member.name, member_id: member.id, tenant_id: tenantId } },
  });
  if (first.error) {
    if (!/already|exists|registered/i.test(first.error.message)) throw new Error(first.error.message);
    const again = await admin.auth.admin.generateLink({ type: "magiclink", email });
    if (again.error) throw new Error(again.error.message);
    tokenHash = again.data.properties.hashed_token;
    type = "magiclink";
  } else {
    tokenHash = first.data.properties.hashed_token;
  }
  const origin = await siteOrigin();
  const inviteLink = `${origin}/auth/confirm?token_hash=${encodeURIComponent(tokenHash)}&type=${type}&next=${encodeURIComponent("/set-password")}`;
  await admin.from("members").update({ invited_at: new Date().toISOString() }).eq("id", member.id);

  let mailSent = false;
  let mailError: string | null = null;
  try {
    const operator = await operatorTenantClient();
    if (!operator) throw new Error("SUPABASE_JWT_SECRET が未設定のため運営側のメールアカウントを使えません");
    const account = await resolveSendAccount(operator, {});
    const mail = await buildMail("tenant_invite", { name: member.name as string, company: (tenant?.name as string) ?? "", inviter: "", link: inviteLink });
    await sendMail(account, { to: [email], subject: mail.subject, text: mail.text });
    mailSent = true;
  } catch (e) {
    mailError = errorMessage(e);
  }
  return { inviteLink, mailSent, mailError };
}

/** 招待メールを再送する(運営側から) */
export async function resendTenantInvite(tenantId: string, memberId: string): Promise<Omit<CreateTenantResult, "id">> {
  await requireOperator();
  const r = await issueInvite(tenantId, memberId);
  revalidatePath(`/admin/tenants/${tenantId}`);
  return r;
}

async function siteOrigin() {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
}

// ---------- テナントの更新 ----------

export async function updateTenantContact(id: string, formData: FormData) {
  const { admin } = await requireOperator();
  const name = s(formData.get("name"));
  if (!name) throw new Error("会社名を入力してください");
  const email = s(formData.get("contact_email"))?.toLowerCase() ?? null;
  if (email && !email.includes("@")) throw new Error("担当者のメールアドレスの形式が正しくありません");
  const { error } = await admin
    .from("tenants")
    .update({
      name,
      contact_name: s(formData.get("contact_name")),
      contact_email: email,
      contact_phone: s(formData.get("contact_phone")),
      address: s(formData.get("address")),
      note: s(formData.get("note")),
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin", "layout");
}

const TENANT_STATUSES: TenantStatus[] = ["trial", "active", "suspended", "cancelled"];
const BILLING_STATUSES: BillingStatus[] = ["none", "trialing", "active", "past_due", "cancelled"];

export async function updateTenantPlan(id: string, formData: FormData) {
  const { admin } = await requireOperator();
  const status = String(formData.get("status") ?? "") as TenantStatus;
  const billing = String(formData.get("billing_status") ?? "") as BillingStatus;
  if (!TENANT_STATUSES.includes(status)) throw new Error("契約状態が不正です");
  if (!BILLING_STATUSES.includes(billing)) throw new Error("課金状態が不正です");
  const trialEnds = s(formData.get("trial_ends_at"));
  const { error } = await admin
    .from("tenants")
    .update({
      status,
      billing_status: billing,
      max_users: int(formData.get("max_users"), 1, "ユーザー数の上限"),
      max_mail_accounts: int(formData.get("max_mail_accounts"), 1, "メールアカウント数の上限"),
      max_storage_bytes: gbToBytes(formData.get("max_storage_gb")),
      trial_ends_at: trialEnds ? new Date(`${trialEnds}T23:59:59+09:00`).toISOString() : null,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin", "layout");
}

/** 運営側から Stripe のサブスクリプション数量を現在の利用数に合わせる */
export async function syncTenantBillingNow(id: string): Promise<void> {
  await requireOperator();
  const { syncTenantBilling } = await import("@/lib/stripe");
  await syncTenantBilling(id);
  revalidatePath(`/admin/tenants/${id}`);
}

/** テナントを削除する。業務データ・利用者の所属もすべて消える(auth ユーザー自体は残る) */
export async function deleteTenant(id: string, confirmSlug: string) {
  const { admin } = await requireOperator();
  const { data: t } = await admin.from("tenants").select("slug, created_at, stripe_subscription_id").eq("id", id).single();
  if (!t) throw new Error("テナントが見つかりません");
  if (t.slug !== confirmSlug) throw new Error("確認のため会社 ID を正しく入力してください");
  const { data: first } = await admin.from("tenants").select("id").order("created_at").limit(1).single();
  if (first?.id === id) throw new Error("運営側のテナント(自社)は削除できません");
  // Stripe の契約が残っていれば先に解約する(請求が続かないように)
  if (t.stripe_subscription_id) {
    const { getStripe, stripeConfigured } = await import("@/lib/stripe");
    if (stripeConfigured()) {
      try {
        await getStripe().subscriptions.cancel(t.stripe_subscription_id as string);
      } catch (e) {
        if (!/No such subscription|already been canceled/i.test(errorMessage(e))) throw new Error(`Stripe の契約を解約できませんでした: ${errorMessage(e)}`);
      }
    }
  }
  // Storage の添付ファイルの実体を先に消す(行は cascade)
  const { data: files } = await admin.from("email_attachments").select("storage_path").eq("tenant_id", id);
  const paths = (files ?? []).map((f) => f.storage_path as string);
  for (let i = 0; i < paths.length; i += 100) {
    await admin.storage.from("email-attachments").remove(paths.slice(i, i + 100));
  }
  const { error } = await admin.from("tenants").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin", "layout");
}
