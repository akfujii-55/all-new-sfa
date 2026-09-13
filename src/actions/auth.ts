"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { createTenantClient, hasTenantClientSupport, operatorTenantClient } from "@/lib/supabase/tenant";
import { resolveSendAccount } from "@/lib/mail/accounts";
import { sendMail } from "@/lib/mail/smtp";
import { buildMail } from "@/lib/mail/templates";
import { errorMessage, logSystem } from "@/lib/log";

export type AuthState = { error?: string; message?: string } | undefined;

/** 同じメールアドレスへの再設定メールは 1 時間に何通まで送るか(いたずら防止) */
const RESET_MAX_PER_HOUR = 3;
const RESET_LOG_SOURCE = "auth.password_reset";

export async function signIn(_: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/");
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: "メールアドレスまたはパスワードが正しくありません" };
  redirect(next.startsWith("/") ? next : "/");
}

/**
 * パスワード再設定メールを送る(ログイン画面の「パスワードを忘れた方」)。
 * Supabase の recovery リンク(token_hash)を作り、招待メールと同じ仕組みで自アプリの SMTP から送る。
 * 送信元はその利用者の会社のメールアカウント、無ければ運営側のメールアカウント。
 * 登録の有無を外部に知らせないため、結果のメッセージは登録があってもなくても同じにする。
 */
export async function requestPasswordReset(_: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "メールアドレスの形式が正しくありません" };
  const done: AuthState = { message: `${email} が登録されていれば、パスワード再設定のメールを送りました。届かない場合は迷惑メールフォルダもご確認ください。` };

  const admin = createAdminClient();
  // 連投の抑制(送った記録は system_logs に残す)
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await admin
    .from("system_logs")
    .select("id", { count: "exact", head: true })
    .eq("source", RESET_LOG_SOURCE)
    .gte("created_at", hourAgo)
    .contains("detail", { email });
  if ((count ?? 0) >= RESET_MAX_PER_HOUR) return done;

  const { data: profile } = await admin.from("profiles").select("id, full_name, tenant_id").eq("email", email).maybeSingle();
  if (!profile) return done;

  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({ type: "recovery", email });
  if (linkErr || !linkData) {
    await logSystem({ level: "warn", source: RESET_LOG_SOURCE, message: `再設定リンクを作れませんでした(${email}): ${linkErr?.message ?? "不明"}`, notify: false });
    return done;
  }
  const origin = await siteOrigin();
  const link = `${origin}/auth/confirm?token_hash=${encodeURIComponent(linkData.properties.hashed_token)}&type=recovery&next=${encodeURIComponent("/set-password?mode=reset")}`;

  try {
    const { db, company } = await senderFor(profile.tenant_id as string | null);
    const account = await resolveSendAccount(db, {});
    const mail = await buildMail("password_reset", { name: (profile.full_name as string | null) ?? email, company, inviter: "", link });
    await sendMail(account, { to: [email], subject: mail.subject, text: mail.text });
    await logSystem({ level: "info", source: RESET_LOG_SOURCE, message: `パスワード再設定メールを送りました: ${email}`, detail: { email }, notify: false });
  } catch (e) {
    await logSystem({ source: RESET_LOG_SOURCE, message: `パスワード再設定メールを送れませんでした(${email}): ${errorMessage(e)}`, detail: { email } });
    return { error: "メールを送信できませんでした。しばらくしてからもう一度お試しいただくか、管理者にお問い合わせください" };
  }
  return done;
}

/** 再設定メールの送信元: 利用者のテナント(メールアカウントがあれば)→ 運営側テナント */
async function senderFor(tenantId: string | null): Promise<{ db: SupabaseClient; company: string }> {
  if (!hasTenantClientSupport()) throw new Error("SUPABASE_JWT_SECRET が未設定のためメールアカウントを使えません");
  if (tenantId) {
    const db = createTenantClient(tenantId);
    const { data: tenant } = await db.from("tenants").select("name").eq("id", tenantId).maybeSingle();
    const { count } = await db.from("mail_accounts").select("id", { count: "exact", head: true }).eq("is_active", true);
    if ((count ?? 0) > 0) return { db, company: (tenant?.name as string | undefined) ?? "" };
  }
  const operator = await operatorTenantClient();
  if (!operator) throw new Error("運営側のメールアカウントを使えません");
  return { db: operator, company: "" };
}

async function siteOrigin() {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
}

/** 招待リンク・再設定リンクから入ったユーザーがパスワードを決める */
export async function setPassword(_: AuthState, formData: FormData): Promise<AuthState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (password.length < 8) return { error: "パスワードは8文字以上にしてください" };
  if (password !== confirm) return { error: "確認用のパスワードが一致しません" };
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { error: "リンクの有効期限が切れています。招待または再設定の手続きをもう一度行ってください。" };
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.message };
  redirect("/");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
