import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/server";
import { operatorTenantClient } from "@/lib/supabase/tenant";
import { createHmac } from "node:crypto";
import { getAlertSettings, splitAlertEmails } from "@/lib/settings";
import { isLarkWebhook, operatorAlertFromRows } from "@/lib/alerts";
import { fmtDateTime } from "@/lib/format";
import type { SystemLogLevel } from "@/lib/types";

import { markUserError } from "@/lib/errors";
/**
 * システムログ(system_logs)への記録と、エラー時の通知。
 *
 * - 記録は失敗してもアプリの処理を止めない(必ず console にも出す)。
 * - level が error のときは通知先(設定画面の「通知先メールアドレス」と環境変数 ALERT_WEBHOOK_URL)に送る。
 *   同じ source の通知は NOTIFY_INTERVAL_MIN 分に 1 回までにして、連続エラー時のメール洪水を防ぐ。
 * - db にログインユーザー/テナント用クライアントを渡すと、そのテナントのログとして記録し、そのテナントの通知先へ送る。
 *   渡さない場合(onRequestError など)は tenant_id が null の「システム全体のログ」として service role で記録し、
 *   通知先は運営側テナント(最初に作られたテナント)の設定を使う。
 */

export interface LogInput {
  level?: SystemLogLevel;
  /** 発生箇所(mail.send / mail.sync / cron.sync / health / action / render / client など) */
  source: string;
  message: string;
  detail?: Record<string, unknown> | null;
  path?: string | null;
  userEmail?: string | null;
  /** 発生したテナント。渡さなければ db(テナント付きクライアント)から調べる。システム全体のログで不明なら null */
  tenant?: { name: string; slug?: string | null } | null;
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
    markUserError(this);
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
  const m = message.trim();
  // 「〜してください」「〜が見つかりません」「〜は必須です」など、入力や操作の問題を利用者に伝える文。
  // 「〜に失敗しました: ...」「〜できませんでした」「〜が設定されていません」は処理や設定の失敗なので通知の対象に残す
  if (/失敗|できませんでした|設定されていません|未設定/.test(m)) return false;
  return /(ください|です|ません|ます)[。)]?$/.test(m);
}

/** ログを 1 件記録する。失敗しても例外は投げない。db を渡すとそのテナントのログになる(渡さなければシステム全体のログ) */
export async function logSystem(input: LogInput, db?: SupabaseClient): Promise<void> {
  const level = input.level ?? "error";
  const line = `[${input.source}] ${input.message}`;
  if (level === "error") console.error(line, input.detail ?? "");
  else if (level === "warn") console.warn(line, input.detail ?? "");
  else console.log(line);

  try {
    // tenant_id は db がテナント付きクライアントならトリガーが補う。service role なら null(システム全体)のまま
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
    if (level === "error" && input.notify !== false) await notifyIfNeeded(client, data.id, input, db ?? null);
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
  /** 汎用 Webhook(Slack 互換の {text} を POST。Lark の URL なら Lark の形式で送る) */
  webhook: string | null;
  /** Lark グループチャットのカスタム Bot(署名シークレットは任意) */
  lark: { url: string; secret: string | null } | null;
}

export function hasAlertTargets(t: AlertTargets): boolean {
  return t.emails.length > 0 || Boolean(t.webhook) || Boolean(t.lark);
}

/** テナントの通知先(設定画面の「通知先メールアドレス」+ 環境変数の Webhook) */
export async function getAlertTargets(db: SupabaseClient): Promise<AlertTargets> {
  const settings = await getAlertSettings(db);
  return { emails: splitAlertEmails(settings.alert_emails), webhook: process.env.ALERT_WEBHOOK_URL?.trim() || null, lark: null };
}

/** 運営側の通知先(運営管理の「エラー通知先」= operator_settings)。システム全体のエラーと各テナントのエラーの控えを送る */
export async function getOperatorAlertTargets(): Promise<AlertTargets> {
  try {
    const { data } = await createAdminClient().from("operator_settings").select("key, value");
    const s = operatorAlertFromRows(data);
    return {
      emails: splitAlertEmails(s.alert_emails),
      webhook: null,
      lark: s.alert_lark_webhook ? { url: s.alert_lark_webhook, secret: s.alert_lark_secret || null } : null,
    };
  } catch {
    return { emails: [], webhook: null, lark: null };
  }
}

/**
 * @param logDb ログを書いたクライアント(重複通知の判定と notified の更新に使う)
 * @param tenantDb テナント付きのクライアント。null ならシステム全体のログなので、運営側テナントの通知先を使う
 */
async function notifyIfNeeded(logDb: SupabaseClient, logId: string, input: LogInput, tenantDb: SupabaseClient | null) {
  // テナントのエラーはそのテナントの通知先へ。運営側の通知先には、システム全体のエラーと各テナントのエラーの控えを送る
  const tenantTargets = tenantDb ? await getAlertTargets(tenantDb) : { emails: [], webhook: process.env.ALERT_WEBHOOK_URL?.trim() || null, lark: null };
  const operatorAll = await getOperatorAlertTargets();
  // 同じ宛先に二重に送らない(運営側テナント自身のエラーなど)
  const operatorTargets: AlertTargets = {
    emails: operatorAll.emails.filter((e) => !tenantTargets.emails.includes(e)),
    webhook: null,
    lark: operatorAll.lark && operatorAll.lark.url !== tenantTargets.webhook ? operatorAll.lark : null,
  };
  if (!hasAlertTargets(tenantTargets) && !hasAlertTargets(operatorTargets)) return;

  // 同じ発生箇所の通知は一定時間に 1 回まで(システム全体のログは tenant_id が null の行だけを見る)
  const since = new Date(Date.now() - NOTIFY_INTERVAL_MIN * 60 * 1000).toISOString();
  let q = logDb
    .from("system_logs")
    .select("id", { count: "exact", head: true })
    .eq("source", input.source)
    .eq("notified", true)
    .gte("created_at", since);
  if (!tenantDb) q = q.is("tenant_id", null);
  const { count } = await q;
  if ((count ?? 0) > 0) return;

  // 先に通知済みにして、並行して起きたエラーが二重に通知されないようにする
  await logDb.from("system_logs").update({ notified: true }).eq("id", logId);

  // どのテナントで起きたかを件名と本文に入れる(サポート時にすぐ分かるように)
  const tenant = input.tenant ?? (tenantDb ? await currentTenantLabel(tenantDb) : null);
  const tenantLabel = tenant ? `${tenant.name}${tenant.slug ? `(${tenant.slug})` : ""}` : null;
  const subject = `[SFA]${tenantLabel ? `[${tenant!.name}]` : ""} エラー: ${input.source} ${input.message}`.slice(0, 120);
  const lines = [
    `発生日時: ${fmtDateTime(new Date())}`,
    `テナント: ${tenantLabel ?? "不明(ログイン外の処理、または運営側)"}`,
    `発生箇所: ${input.source}`,
    `内容: ${input.message}`,
    input.path ? `パス: ${input.path}` : null,
    input.userEmail ? `操作ユーザー: ${input.userEmail}` : null,
    input.detail ? `詳細:\n${JSON.stringify(input.detail, null, 2).slice(0, 3000)}` : null,
    appUrl() ? `ログ一覧: ${appUrl()}/settings/logs` : null,
    `※ 同じ発生箇所の通知は ${NOTIFY_INTERVAL_MIN} 分に 1 回までです。`,
  ].filter((l): l is string => Boolean(l));
  const body = lines.join("\n");

  if (hasAlertTargets(tenantTargets)) await sendAlert(tenantDb, { subject, body, targets: tenantTargets });
  if (hasAlertTargets(operatorTargets)) await sendAlert(await operatorTenantClient(), { subject, body, targets: operatorTargets });
}

async function currentTenantLabel(db: SupabaseClient): Promise<{ name: string; slug: string | null } | null> {
  try {
    const { data } = await db.from("tenants").select("name, slug").maybeSingle();
    return data ? { name: data.name as string, slug: (data.slug as string | null) ?? null } : null;
  } catch {
    return null;
  }
}

/**
 * Webhook にテキストを POST する。Lark / 飛書のカスタム Bot なら {msg_type:"text"} の形式と署名(timestamp + "\n" + secret を鍵にした HMAC-SHA256 の Base64)、
 * それ以外は Slack 互換の {text}。成功なら null、失敗なら理由を返す
 */
async function postWebhook(url: string, larkSecret: string | null, text: string): Promise<string | null> {
  try {
    let payload: Record<string, unknown> = { text };
    if (isLarkWebhook(url)) {
      payload = { msg_type: "text", content: { text } };
      if (larkSecret) {
        const timestamp = Math.floor(Date.now() / 1000).toString();
        payload.timestamp = timestamp;
        payload.sign = createHmac("sha256", `${timestamp}\n${larkSecret}`).update("").digest("base64");
      }
    }
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return `応答 ${res.status}`;
    if (isLarkWebhook(url)) {
      // Lark は HTTP 200 でも本文の code で失敗を返す(署名不一致など)
      const json = (await res.json().catch(() => null)) as { code?: number; StatusCode?: number; msg?: string } | null;
      const code = json?.code ?? json?.StatusCode ?? 0;
      if (code !== 0) return `Lark 応答 code=${code} ${json?.msg ?? ""}`.trim();
    }
    return null;
  } catch (e) {
    return errorMessage(e);
  }
}

/** 通知を送る(メールと Webhook)。失敗は warn として記録し、例外は投げない。db が null ならメールは送れない(Webhook のみ) */
export async function sendAlert(
  db: SupabaseClient | null,
  { subject, body, targets }: { subject: string; body: string; targets: AlertTargets },
): Promise<{ email: boolean | null; webhook: boolean | null; lark: boolean | null; errors: string[] }> {
  const result = { email: null as boolean | null, webhook: null as boolean | null, lark: null as boolean | null, errors: [] as string[] };
  const text = `${subject}\n${body}`;

  if (targets.webhook) {
    const err = await postWebhook(targets.webhook, null, text);
    result.webhook = !err;
    if (err) result.errors.push(`Webhook: ${err}`);
  }
  if (targets.lark) {
    const err = await postWebhook(targets.lark.url, targets.lark.secret, text);
    result.lark = !err;
    if (err) result.errors.push(`Lark: ${err}`);
  }

  if (targets.emails.length > 0 && !db) {
    result.email = false;
    result.errors.push("メール: 送信に使うテナントを特定できません(SUPABASE_JWT_SECRET が未設定)");
  } else if (targets.emails.length > 0 && db) {
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
      db ?? undefined,
    );
  }
  return result;
}
