import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/server";
import { getAlertSettings, splitAlertEmails } from "@/lib/settings";
import { fmtDateTime } from "@/lib/format";
import type { SystemLogLevel } from "@/lib/types";

/**
 * システムログ(system_logs)への記録と、エラー時の通知。
 *
 * - 記録は失敗してもアプリの処理を止めない(必ず console にも出す)。
 * - level が error のときは通知先(設定画面の「通知先メールアドレス」と環境変数 ALERT_WEBHOOK_URL)に送る。
 *   同じ source の通知は NOTIFY_INTERVAL_MIN 分に 1 回までにして、連続エラー時のメール洪水を防ぐ。
 */

export interface LogInput {
  level?: SystemLogLevel;
  /** 発生箇所(mail.send / mail.sync / cron.sync / health / action / render / client など) */
  source: string;
  message: string;
  detail?: Record<string, unknown> | null;
  path?: string | null;
  userEmail?: string | null;
  /** false にすると error でも通知しない(通知処理自体の失敗など) */
  notify?: boolean;
}

const NOTIFY_INTERVAL_MIN = 30;

/** 既に system_logs に記録済みのエラー。onRequestError で二重に記録しないための目印 */
export class LoggedError extends Error {
  readonly logged = true;
  constructor(message: string, cause?: unknown) {
    super(message, cause instanceof Error ? { cause } : undefined);
    this.name = "LoggedError";
  }
}

export function isLoggedError(e: unknown): boolean {
  return typeof e === "object" && e !== null && "logged" in e && (e as { logged?: unknown }).logged === true;
}

export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

/** スタックトレースや SMTP/IMAP の応答など、後から原因を追うための情報 */
export function errorDetail(e: unknown): Record<string, unknown> {
  if (!(e instanceof Error)) return { value: errorMessage(e) };
  const x = e as Error & { code?: unknown; digest?: unknown; responseText?: unknown; response?: unknown; command?: unknown; cause?: unknown };
  const d: Record<string, unknown> = { name: e.name, stack: e.stack?.slice(0, 2000) };
  if (x.code !== undefined) d.code = x.code;
  if (x.digest !== undefined) d.digest = x.digest;
  if (x.responseText !== undefined) d.responseText = x.responseText;
  if (typeof x.response === "string") d.response = x.response;
  if (x.command !== undefined) d.command = x.command;
  if (x.cause instanceof Error) d.cause = x.cause.message;
  return d;
}

/**
 * 入力チェックなど、利用者に見せるための想定内エラーか(記録は warn、通知はしない)。
 * 既存の Server Action は「〜してください」「〜が必要です」で終わるメッセージを投げる。
 */
export function isUserFacingError(message: string): boolean {
  return /(してください|が必要です|正しくありません|ありません|できません)[。)]?$/.test(message.trim());
}

/** ログを 1 件記録する。失敗しても例外は投げない */
export async function logSystem(input: LogInput, db?: SupabaseClient): Promise<void> {
  const level = input.level ?? "error";
  const line = `[${input.source}] ${input.message}`;
  if (level === "error") console.error(line, input.detail ?? "");
  else if (level === "warn") console.warn(line, input.detail ?? "");
  else console.log(line);

  try {
    const client = db ?? createAdminClient();
    const { data, error } = await client
      .from("system_logs")
      .insert({
        level,
        source: input.source,
        message: input.message.slice(0, 4000),
        detail: input.detail ?? null,
        request_path: input.path ?? null,
        user_email: input.userEmail ?? null,
      })
      .select("id")
      .single();
    if (error) {
      console.error("[log] system_logs への記録に失敗:", error.message);
      return;
    }
    if (level === "error" && input.notify !== false) await notifyIfNeeded(client, data.id, input);
  } catch (e) {
    console.error("[log] 記録処理で例外:", errorMessage(e));
  }
}

function appUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (explicit) return explicit;
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return vercel ? `https://${vercel}` : "";
}

export interface AlertTargets {
  emails: string[];
  webhook: string | null;
}

export async function getAlertTargets(db: SupabaseClient): Promise<AlertTargets> {
  const settings = await getAlertSettings(db);
  return { emails: splitAlertEmails(settings.alert_emails), webhook: process.env.ALERT_WEBHOOK_URL?.trim() || null };
}

async function notifyIfNeeded(db: SupabaseClient, logId: string, input: LogInput) {
  const targets = await getAlertTargets(db);
  if (targets.emails.length === 0 && !targets.webhook) return;

  // 同じ発生箇所の通知は一定時間に 1 回まで
  const since = new Date(Date.now() - NOTIFY_INTERVAL_MIN * 60 * 1000).toISOString();
  const { count } = await db
    .from("system_logs")
    .select("id", { count: "exact", head: true })
    .eq("source", input.source)
    .eq("notified", true)
    .gte("created_at", since);
  if ((count ?? 0) > 0) return;

  // 先に通知済みにして、並行して起きたエラーが二重に通知されないようにする
  await db.from("system_logs").update({ notified: true }).eq("id", logId);

  const subject = `[SFA] エラー: ${input.source} ${input.message}`.slice(0, 120);
  const lines = [
    `発生日時: ${fmtDateTime(new Date())}`,
    `発生箇所: ${input.source}`,
    `内容: ${input.message}`,
    input.path ? `パス: ${input.path}` : null,
    input.userEmail ? `操作ユーザー: ${input.userEmail}` : null,
    input.detail ? `詳細:\n${JSON.stringify(input.detail, null, 2).slice(0, 3000)}` : null,
    appUrl() ? `ログ一覧: ${appUrl()}/settings/logs` : null,
    `※ 同じ発生箇所の通知は ${NOTIFY_INTERVAL_MIN} 分に 1 回までです。`,
  ].filter((l): l is string => Boolean(l));
  const body = lines.join("\n");

  await sendAlert(db, { subject, body, targets });
}

/** 通知を送る(メールと Webhook)。失敗は warn として記録し、例外は投げない */
export async function sendAlert(
  db: SupabaseClient,
  { subject, body, targets }: { subject: string; body: string; targets: AlertTargets },
): Promise<{ email: boolean | null; webhook: boolean | null; errors: string[] }> {
  const result = { email: null as boolean | null, webhook: null as boolean | null, errors: [] as string[] };

  if (targets.webhook) {
    try {
      const res = await fetch(targets.webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: `${subject}\n${body}` }),
        signal: AbortSignal.timeout(10_000),
      });
      result.webhook = res.ok;
      if (!res.ok) result.errors.push(`Webhook 応答 ${res.status}`);
    } catch (e) {
      result.webhook = false;
      result.errors.push(`Webhook: ${errorMessage(e)}`);
    }
  }

  if (targets.emails.length > 0) {
    try {
      const { resolveSendAccount } = await import("@/lib/mail/accounts");
      const { sendMail } = await import("@/lib/mail/smtp");
      const account = await resolveSendAccount(db, {});
      await sendMail(account, { to: targets.emails, subject, text: body });
      result.email = true;
    } catch (e) {
      result.email = false;
      result.errors.push(`メール: ${errorMessage(e)}`);
    }
  }

  if (result.errors.length > 0) {
    await logSystem(
      { level: "warn", source: "alert", message: `通知の送信に失敗: ${result.errors.join(" / ")}`, detail: { subject }, notify: false },
      db,
    );
  }
  return result;
}
