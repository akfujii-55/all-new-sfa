/**
 * 運営側のエラー通知先(operator_settings)。
 * システム全体のエラーと、各テナントで起きたエラーの控えをここへ送る。サーバー・クライアント共通(サーバー専用モジュールを import しない)。
 */
export interface OperatorAlertSettings {
  /** 通知先メールアドレス(カンマ区切りで複数可) */
  alert_emails: string;
  /** Lark(飛書)グループチャットのカスタム Bot Webhook URL */
  alert_lark_webhook: string;
  /** Lark Bot の署名シークレット(署名検証を有効にした場合のみ) */
  alert_lark_secret: string;
}

export const DEFAULT_OPERATOR_ALERT_SETTINGS: OperatorAlertSettings = { alert_emails: "", alert_lark_webhook: "", alert_lark_secret: "" };
export const OPERATOR_ALERT_KEYS = Object.keys(DEFAULT_OPERATOR_ALERT_SETTINGS) as (keyof OperatorAlertSettings)[];

export function operatorAlertFromRows(rows: { key: string; value: string }[] | null | undefined): OperatorAlertSettings {
  const out = { ...DEFAULT_OPERATOR_ALERT_SETTINGS };
  for (const r of rows ?? []) {
    if ((OPERATOR_ALERT_KEYS as string[]).includes(r.key)) out[r.key as keyof OperatorAlertSettings] = String(r.value ?? "").trim();
  }
  return out;
}

/** Lark / 飛書のカスタム Bot Webhook かどうか(送る JSON の形が Slack などと違う) */
export function isLarkWebhook(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return /(^|\.)(larksuite\.com|feishu\.cn)$/.test(host) && new URL(url).pathname.startsWith("/open-apis/bot/");
  } catch {
    return false;
  }
}
