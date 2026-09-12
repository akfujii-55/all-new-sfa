"use server";

import { createHash, randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/server";
import { operatorTenantClient } from "@/lib/supabase/tenant";
import { resolveSendAccount } from "@/lib/mail/accounts";
import { sendMail } from "@/lib/mail/smtp";
import { buildMail } from "@/lib/mail/templates";
import { errorDetail, errorMessage, getAlertTargets, logSystem, sendAlert } from "@/lib/log";
import { fmtDateTime } from "@/lib/format";

/**
 * Web からの申し込み(自動開設)。
 * 1. /signup のフォーム → requestSignup: 内容を signup_requests に保存し、確認メール(トークン付きリンク)を運営側のメールアカウントから送る。
 * 2. メールのリンク /signup/verify?token=... → 内容を表示して「アカウントを開設する」ボタン(メールのリンクを開いただけでは作らない。
 *    セキュリティスキャナがリンクを踏んでトークンを消費しないため)。
 * 3. completeSignup: create_tenant(source=signup)でテナントと最初の営業担当者を作り、Supabase の招待リンクへそのまま送って
 *    パスワード設定 → ログイン。運営には通知メール。
 * テナントができる前の処理なので service role を使う(signup_requests / tenants は業務テーブルではない)。
 */

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;
const TOKEN_TTL_HOURS = 24;
const MAX_PER_EMAIL_PER_DAY = 3;
const MAX_PER_IP_PER_HOUR = 10;

export type SignupState = { ok: true; email: string } | { ok: false; error: string; values: Record<string, string> } | undefined;

function s(v: FormDataEntryValue | null) {
  const t = String(v ?? "").trim();
  return t.length ? t : null;
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

async function siteOrigin() {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
}

async function clientIp() {
  const h = await headers();
  return (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || null;
}

/** 会社 ID が使えるか(既存テナント・開設待ちの申し込みと重複しないか) */
export async function isSlugAvailable(slug: string): Promise<boolean> {
  if (!SLUG_RE.test(slug)) return false;
  const admin = createAdminClient();
  const { count } = await admin.from("tenants").select("id", { count: "exact", head: true }).eq("slug", slug);
  return (count ?? 0) === 0;
}

export async function requestSignup(_: SignupState, formData: FormData): Promise<SignupState> {
  const values = {
    company_name: s(formData.get("company_name")) ?? "",
    slug: (s(formData.get("slug")) ?? "").toLowerCase(),
    contact_name: s(formData.get("contact_name")) ?? "",
    email: (s(formData.get("email")) ?? "").toLowerCase(),
    contact_phone: s(formData.get("contact_phone")) ?? "",
  };
  const fail = (error: string): SignupState => ({ ok: false, error, values });

  if (!values.company_name) return fail("会社名を入力してください");
  if (!SLUG_RE.test(values.slug)) return fail("会社 ID は英小文字・数字・ハイフンで 3〜40 文字(先頭と末尾は英数字)にしてください");
  if (!values.contact_name) return fail("担当者名を入力してください");
  if (!values.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) return fail("メールアドレスの形式が正しくありません");
  if (formData.get("agree") !== "on") return fail("利用規約への同意が必要です");

  const admin = createAdminClient();
  const ip = await clientIp();

  // 既にログインできるメールアドレスは別テナントに所属しているので申し込みできない
  const { count: existing } = await admin.from("profiles").select("id", { count: "exact", head: true }).eq("email", values.email);
  if ((existing ?? 0) > 0) return fail("このメールアドレスは既に登録されています。ログイン画面からログインしてください");
  if (!(await isSlugAvailable(values.slug))) return fail("この会社 ID は既に使われています。別の ID を指定してください");

  // 連投の抑制
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count: byEmail } = await admin.from("signup_requests").select("id", { count: "exact", head: true }).eq("email", values.email).gte("created_at", dayAgo);
  if ((byEmail ?? 0) >= MAX_PER_EMAIL_PER_DAY) return fail("このメールアドレスへの確認メールは本日の上限に達しました。届いているメールをご確認いただくか、時間をおいてお試しください");
  if (ip) {
    const { count: byIp } = await admin.from("signup_requests").select("id", { count: "exact", head: true }).eq("ip", ip).gte("created_at", hourAgo);
    if ((byIp ?? 0) >= MAX_PER_IP_PER_HOUR) return fail("申し込みが集中しています。しばらくしてからお試しください");
  }

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + TOKEN_TTL_HOURS * 60 * 60 * 1000);
  const { data: row, error } = await admin
    .from("signup_requests")
    .insert({
      email: values.email,
      company_name: values.company_name,
      slug: values.slug,
      contact_name: values.contact_name,
      contact_phone: values.contact_phone || null,
      token_hash: hashToken(token),
      expires_at: expiresAt.toISOString(),
      ip,
    })
    .select("id")
    .single();
  if (error) {
    await logSystem({ source: "signup", message: `申し込みの保存に失敗しました: ${error.message}`, detail: { code: error.code } });
    return fail("申し込みを受け付けられませんでした。時間をおいてお試しください");
  }

  const link = `${await siteOrigin()}/signup/verify?token=${encodeURIComponent(token)}`;
  try {
    const operator = await operatorTenantClient();
    if (!operator) throw new Error("SUPABASE_JWT_SECRET が未設定のため運営側のメールアカウントを使えません");
    const account = await resolveSendAccount(operator, {});
    const mail = await buildMail("signup_confirm", { name: values.contact_name, company: values.company_name, inviter: "", link, expires: `${TOKEN_TTL_HOURS} 時間` });
    await sendMail(account, { to: [values.email], subject: mail.subject, text: mail.text });
  } catch (e) {
    await admin.from("signup_requests").update({ status: "expired" }).eq("id", row.id);
    await logSystem({ source: "signup", message: `申し込みの確認メールを送れませんでした(${values.email}): ${errorMessage(e)}`, detail: errorDetail(e) });
    return fail("確認メールを送信できませんでした。時間をおいてお試しいただくか、運営までお問い合わせください");
  }
  return { ok: true, email: values.email };
}

export interface PendingSignup {
  id: string;
  email: string;
  company_name: string;
  slug: string;
  contact_name: string;
  expires_at: string;
}

/** 確認リンクのトークンから開設待ちの申し込みを返す。無効・期限切れ・開設済みなら null */
export async function findPendingSignup(token: string | null | undefined): Promise<PendingSignup | null> {
  if (!token) return null;
  const { data } = await createAdminClient()
    .from("signup_requests")
    .select("id, email, company_name, slug, contact_name, expires_at, status")
    .eq("token_hash", hashToken(token))
    .maybeSingle();
  if (!data || data.status !== "pending" || Date.parse(data.expires_at as string) < Date.now()) return null;
  return data as PendingSignup;
}

/** 「アカウントを開設する」ボタン。テナントを作り、パスワード設定画面へ送る */
export async function completeSignup(token: string): Promise<{ error: string } | never> {
  const req = await findPendingSignup(token);
  if (!req) return { error: "このリンクは無効か、有効期限が切れています。もう一度お申し込みください" };
  const admin = createAdminClient();

  if (!(await isSlugAvailable(req.slug))) {
    await admin.from("signup_requests").update({ status: "expired" }).eq("id", req.id);
    return { error: "この会社 ID は先に別の会社に使われました。別の ID でもう一度お申し込みください" };
  }
  const { count: existing } = await admin.from("profiles").select("id", { count: "exact", head: true }).eq("email", req.email);
  if ((existing ?? 0) > 0) return { error: "このメールアドレスは既に登録されています。ログイン画面からログインしてください" };

  // 先に開設済みにして、二重クリックで 2 つ作らない
  const { data: claimed } = await admin
    .from("signup_requests")
    .update({ status: "verified", verified_at: new Date().toISOString() })
    .eq("id", req.id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (!claimed) return { error: "この申し込みは処理中です。しばらくしてからログイン画面をお試しください" };

  const { data: tenantId, error } = await admin.rpc("create_tenant", {
    p_name: req.company_name,
    p_slug: req.slug,
    p_owner_name: req.contact_name,
    p_owner_email: req.email,
    p_contact_phone: null,
    p_address: null,
    p_max_users: null,
    p_max_mail_accounts: null,
    p_max_storage_bytes: null,
    p_trial_days: null,
    p_source: "signup",
  });
  if (error || !tenantId) {
    await admin.from("signup_requests").update({ status: "pending", verified_at: null }).eq("id", req.id);
    await logSystem({ source: "signup", message: `テナントの作成に失敗しました(${req.slug}): ${error?.message ?? "不明"}`, detail: { code: error?.code } });
    return { error: error?.code === "23505" ? "この会社 ID は既に使われています。別の ID でもう一度お申し込みください" : "アカウントを作成できませんでした。運営までお問い合わせください" };
  }
  await admin.from("signup_requests").update({ tenant_id: tenantId }).eq("id", req.id);

  // 最初の営業担当者(申込者)にそのままパスワード設定へ進んでもらう。member_id / tenant_id は handle_new_user が所属の結び付けに使う
  const { data: member } = await admin.from("members").select("id, name").eq("tenant_id", tenantId).order("created_at").limit(1).single();
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: "invite",
    email: req.email,
    options: { data: { full_name: member?.name ?? req.contact_name, member_id: member?.id, tenant_id: tenantId } },
  });
  if (linkErr) {
    await logSystem({ source: "signup", message: `申込者のログインリンクを作れませんでした(${req.email}): ${linkErr.message}` });
    return { error: "アカウントは作成しましたが、ログインの準備に失敗しました。運営までお問い合わせください" };
  }
  await admin.from("members").update({ invited_at: new Date().toISOString() }).eq("id", member!.id);

  await notifyOperators(req, tenantId as string);

  const next = encodeURIComponent("/set-password");
  redirect(`/auth/confirm?token_hash=${encodeURIComponent(linkData.properties.hashed_token)}&type=invite&next=${next}`);
}

/** 運営側の通知先(設定画面の通知先メール・Webhook)に新規申し込みを知らせる。失敗しても申し込みは止めない */
async function notifyOperators(req: PendingSignup, tenantId: string) {
  try {
    const operator = await operatorTenantClient();
    const targets = operator ? await getAlertTargets(operator) : { emails: [], webhook: process.env.ALERT_WEBHOOK_URL?.trim() || null };
    const origin = await siteOrigin();
    const body = [
      `Web から新しい申し込みがあり、アカウントを自動開設しました。`,
      ``,
      `会社名: ${req.company_name}`,
      `会社 ID: ${req.slug}`,
      `担当者: ${req.contact_name}`,
      `メール: ${req.email}`,
      `開設日時: ${fmtDateTime(new Date())}`,
      ``,
      `運営管理: ${origin}/admin/tenants/${tenantId}`,
    ].join("\n");
    await sendAlert(operator, { subject: `[SFA] 新規申し込み: ${req.company_name}(${req.slug})`, body, targets });
    await logSystem({ level: "info", source: "signup", message: `新規申し込み: ${req.company_name}(${req.slug}、${req.email})`, notify: false });
  } catch (e) {
    await logSystem({ level: "warn", source: "signup", message: `申し込みの運営通知に失敗しました: ${errorMessage(e)}`, notify: false });
  }
}
