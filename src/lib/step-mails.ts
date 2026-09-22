import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/server";
import { operatorTenantClient } from "@/lib/supabase/tenant";
import { resolveSendAccount } from "@/lib/mail/accounts";
import { sendMail } from "@/lib/mail/smtp";
import { APP_NAME } from "@/lib/mail/templates-shared";
import { OPERATOR } from "@/lib/legal";
import { errorMessage, logSystem } from "@/lib/log";
import { userError } from "@/lib/errors";
import type { Tenant } from "@/lib/types";
import { STEP_MAIL_GRACE_DAYS, renderStepMail, type StepMail, type StepMailLog, type StepMailVars } from "@/lib/step-mails-shared";

export * from "@/lib/step-mails-shared";

/**
 * ステップメールの送信(サーバー専用)。
 * - 起点はテナント作成日(日本時間の日付)。作成日 + day_offset が今日以前で未送信の回を送る。
 * - 予定日から STEP_MAIL_GRACE_DAYS 日以上過ぎた回は送らず「見送り」に記録する(導入前からあるテナントに一斉に届かないように)。
 * - 停止・解約のテナント、「送らない」にしたテナントには送らない。課金開始後は send_after_paid の回だけ送る。
 * - 差出人は運営側テナントの既定のメールアカウント、宛先はテナントの連絡先メール(無ければ最初の利用者)。
 */

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 日本時間の日付(yyyy-mm-dd) */
export function jstDate(d: Date): string {
  return new Date(d.getTime() + JST_OFFSET_MS).toISOString().slice(0, 10);
}
function addDays(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function diffDays(a: string, b: string): number {
  return Math.round((new Date(`${a}T00:00:00Z`).getTime() - new Date(`${b}T00:00:00Z`).getTime()) / 86_400_000);
}
function fmtJa(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return `${y}年${m}月${d}日`;
}

function siteOrigin(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
}

/** テナントの情報から差し込みの値を作る */
export function stepMailVarsFor(tenant: Pick<Tenant, "name" | "contact_name" | "trial_ends_at">, now = new Date()): StepMailVars {
  const origin = siteOrigin();
  const trialEnd = tenant.trial_ends_at ? jstDate(new Date(tenant.trial_ends_at)) : null;
  const daysLeft = trialEnd ? Math.max(0, diffDays(trialEnd, jstDate(now))) : null;
  return {
    name: tenant.contact_name?.trim() || "ご担当者",
    company: tenant.name,
    app_name: APP_NAME,
    login_link: `${origin}/login`,
    billing_link: `${origin}/settings/billing`,
    manual_link: `${origin}/docs/manual`,
    trial_end: trialEnd ? fmtJa(trialEnd) : "",
    days_left: daysLeft === null ? "" : String(daysLeft),
  };
}

/** 本文末尾の固定文(運営の会社名と問い合わせ先) */
export function stepMailFooter(): string {
  return `\n\n──────────\n${OPERATOR.name}\n${OPERATOR.email}\n${OPERATOR.website}`;
}

export function buildStepMail(step: Pick<StepMail, "subject" | "body">, vars: StepMailVars) {
  return { subject: renderStepMail(step.subject, vars), text: renderStepMail(step.body, vars) + stepMailFooter() };
}

/** 課金が始まっている(カード登録済み、または運営が契約中にした)。billing_status の trialing はカード未登録でも付くので見ない */
function isPaid(t: Tenant): boolean {
  return Boolean(t.stripe_subscription_id) || t.status === "active" || ["active", "past_due"].includes(t.billing_status);
}

export interface StepMailRunResult {
  sent: number;
  failed: number;
  skipped: number;
  /** テナントごとの内訳(送信・失敗したものだけ) */
  details: { tenant: string; step: string; status: "sent" | "failed"; to: string | null; error?: string }[];
}

/** 今日の分を送る(cron から毎朝呼ぶ)。同じ日に何度呼んでも二重には送らない */
export async function runStepMails(now = new Date()): Promise<StepMailRunResult> {
  const admin = createAdminClient();
  const result: StepMailRunResult = { sent: 0, failed: 0, skipped: 0, details: [] };
  const today = jstDate(now);

  const { data: stepRows, error: stepErr } = await admin.from("step_mails").select("*").eq("is_active", true).order("day_offset");
  if (stepErr) throw userError(`ステップメールの読み込みに失敗しました: ${stepErr.message}`);
  const steps = (stepRows ?? []) as StepMail[];
  if (steps.length === 0) return result;

  const { data: tenantRows, error: tenantErr } = await admin
    .from("tenants")
    .select("*")
    .eq("step_mails_enabled", true)
    .in("status", ["trial", "active"])
    .order("created_at");
  if (tenantErr) throw userError(`テナント一覧の取得に失敗しました: ${tenantErr.message}`);
  const tenants = (tenantRows ?? []) as Tenant[];
  if (tenants.length === 0) return result;

  const { data: logRows } = await admin.from("step_mail_logs").select("tenant_id, step_id, status, due_on").in("tenant_id", tenants.map((t) => t.id));
  const logs = new Map<string, { status: string; due_on: string }>();
  for (const l of (logRows ?? []) as { tenant_id: string; step_id: string; status: string; due_on: string }[]) logs.set(`${l.tenant_id}:${l.step_id}`, l);

  // 差出人は運営側テナントの既定アカウント。無ければ全部失敗として記録する(通知が飛ぶ)
  let operator: SupabaseClient | null = null;
  let account: Awaited<ReturnType<typeof resolveSendAccount>> | null = null;
  let accountError: string | null = null;
  try {
    operator = await operatorTenantClient();
    if (!operator) throw userError("運営側のテナントがありません");
    account = await resolveSendAccount(operator, {});
  } catch (e) {
    accountError = errorMessage(e);
  }

  for (const tenant of tenants) {
    const createdOn = jstDate(new Date(tenant.created_at));
    const paid = isPaid(tenant);
    let toEmail: string | null | undefined;

    for (const step of steps) {
      const dueOn = addDays(createdOn, step.day_offset);
      const passed = diffDays(today, dueOn);
      if (passed < 0) continue; // まだ先
      const prev = logs.get(`${tenant.id}:${step.id}`);
      if (prev && prev.status !== "failed") continue; // 送信済み・見送り済み

      const record = async (status: StepMailLog["status"], to: string | null, error: string | null) => {
        await admin
          .from("step_mail_logs")
          .upsert({ tenant_id: tenant.id, step_id: step.id, status, to_email: to, error, due_on: dueOn, sent_at: now.toISOString() }, { onConflict: "tenant_id,step_id" });
      };

      // 予定日を過ぎすぎた回、課金開始後に送らない回は見送り(記録だけ残す)
      if (passed >= STEP_MAIL_GRACE_DAYS) {
        await record("skipped", null, prev ? `失敗のまま猶予(${STEP_MAIL_GRACE_DAYS} 日)を過ぎました` : "予定日を過ぎていたため送信しませんでした");
        result.skipped++;
        continue;
      }
      if (paid && !step.send_after_paid) {
        await record("skipped", null, "課金開始後のため送信しませんでした");
        result.skipped++;
        continue;
      }

      if (toEmail === undefined) toEmail = await recipientOf(admin, tenant);
      if (!toEmail) {
        await record("failed", null, "宛先のメールアドレスがありません(テナントの連絡先を設定してください)");
        result.failed++;
        result.details.push({ tenant: tenant.slug, step: step.name, status: "failed", to: null, error: "宛先なし" });
        continue;
      }
      if (!account) {
        await record("failed", toEmail, accountError ?? "送信用のメールアカウントがありません");
        result.failed++;
        result.details.push({ tenant: tenant.slug, step: step.name, status: "failed", to: toEmail, error: accountError ?? "" });
        continue;
      }
      try {
        const mail = buildStepMail(step, stepMailVarsFor(tenant, now));
        await sendMail(account, { to: [toEmail], subject: mail.subject, text: mail.text });
        await record("sent", toEmail, null);
        result.sent++;
        result.details.push({ tenant: tenant.slug, step: step.name, status: "sent", to: toEmail });
      } catch (e) {
        await record("failed", toEmail, errorMessage(e));
        result.failed++;
        result.details.push({ tenant: tenant.slug, step: step.name, status: "failed", to: toEmail, error: errorMessage(e) });
      }
    }
  }

  if (result.failed > 0) {
    await logSystem({
      source: "cron.step_mails",
      message: `ステップメールの送信に失敗しました(${result.failed} 件。送信 ${result.sent} 件、見送り ${result.skipped} 件)`,
      detail: { failed: result.details.filter((d) => d.status === "failed") },
    });
  } else if (result.sent > 0) {
    await logSystem({ level: "info", source: "cron.step_mails", message: `ステップメール: ${result.sent} 件送信、${result.skipped} 件見送り`, detail: { sent: result.details } });
  }
  return result;
}

/** 宛先: テナントの連絡先メール。無ければそのテナントの最初の利用者 */
async function recipientOf(admin: SupabaseClient, tenant: Tenant): Promise<string | null> {
  const contact = tenant.contact_email?.trim().toLowerCase();
  if (contact) return contact;
  const { data } = await admin.from("profiles").select("email").eq("tenant_id", tenant.id).order("created_at").limit(1).maybeSingle();
  return data?.email?.toLowerCase() ?? null;
}

/** テストとして 1 通送る(運営管理の編集画面から自分宛て)。サンプルの差し込みで送る */
export async function sendStepMailTest(step: Pick<StepMail, "subject" | "body">, to: string, vars: StepMailVars): Promise<void> {
  const operator = await operatorTenantClient();
  if (!operator) throw userError("運営側のテナントがありません");
  const account = await resolveSendAccount(operator, {});
  const mail = buildStepMail(step, vars);
  await sendMail(account, { to: [to], subject: `[テスト] ${mail.subject}`, text: mail.text });
}
