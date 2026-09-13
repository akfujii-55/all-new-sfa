import type { SupabaseClient } from "@supabase/supabase-js";

/** 設定画面から変更できるアプリ設定(app_settings テーブル)。未保存のキーは既定値を使う */
export interface MailSettings {
  /** 署名の会社名 */
  signature_company: string;
  /** 署名のメールアドレス */
  signature_email: string;
  /** 署名の追加行(電話番号・住所・URL など。複数行可) */
  signature_extra: string;
  /** 返信メールの件名の初期値 */
  reply_subject: string;
}

/** 未保存のときの既定値。テナント作成時(create_tenant)に会社名などを入れた行が作られるので、通常はここには落ちない */
export const DEFAULT_MAIL_SETTINGS: MailSettings = {
  signature_company: "",
  signature_email: "",
  signature_extra: "",
  reply_subject: "お問い合わせありがとうございます",
};

export const MAIL_SETTING_KEYS = Object.keys(DEFAULT_MAIL_SETTINGS) as (keyof MailSettings)[];

export async function getMailSettings(db: SupabaseClient): Promise<MailSettings> {
  const { data } = await db.from("app_settings").select("key, value").in("key", MAIL_SETTING_KEYS);
  const settings = { ...DEFAULT_MAIL_SETTINGS };
  for (const row of data ?? []) {
    if ((MAIL_SETTING_KEYS as string[]).includes(row.key)) settings[row.key as keyof MailSettings] = String(row.value ?? "");
  }
  return settings;
}

/** エラー通知の設定(app_settings テーブル) */
export interface AlertSettings {
  /** 通知先メールアドレス(カンマ区切り)。空なら通知メールを送らない */
  alert_emails: string;
}

export const DEFAULT_ALERT_SETTINGS: AlertSettings = { alert_emails: "" };
export const ALERT_SETTING_KEYS = Object.keys(DEFAULT_ALERT_SETTINGS) as (keyof AlertSettings)[];

export async function getAlertSettings(db: SupabaseClient): Promise<AlertSettings> {
  const { data } = await db.from("app_settings").select("key, value").in("key", ALERT_SETTING_KEYS);
  const settings = { ...DEFAULT_ALERT_SETTINGS };
  for (const row of data ?? []) {
    if ((ALERT_SETTING_KEYS as string[]).includes(row.key)) settings[row.key as keyof AlertSettings] = String(row.value ?? "");
  }
  return settings;
}

/** カンマ・改行区切りの通知先を配列にする */
export function splitAlertEmails(v: string): string[] {
  return Array.from(new Set(v.split(/[,;\s]+/).map((a) => a.trim().toLowerCase()).filter((a) => a.includes("@"))));
}

/**
 * 問い合わせフォームの通知メールの読み取り設定(app_settings テーブル)。
 * 通知メールの「お名前: ◯◯」のようなラベル行から問い合わせ者の情報を取り出すときに、
 * 既定のラベル(src/lib/mail/extract.ts の DEFAULT_FORM_LABELS)に加えて、そのテナントのフォーム固有のラベルを使う。
 * 値はカンマまたは改行区切り。
 */
export interface FormSettings {
  /** 通知メールの送信元アドレス(フォームツールの差出人)。ここからのメールはフォーム通知として扱う */
  form_senders: string;
  form_labels_name: string;
  form_labels_company: string;
  form_labels_email: string;
  form_labels_phone: string;
  form_labels_message: string;
}

export const DEFAULT_FORM_SETTINGS: FormSettings = {
  form_senders: "",
  form_labels_name: "",
  form_labels_company: "",
  form_labels_email: "",
  form_labels_phone: "",
  form_labels_message: "",
};
export const FORM_SETTING_KEYS = Object.keys(DEFAULT_FORM_SETTINGS) as (keyof FormSettings)[];

export async function getFormSettings(db: SupabaseClient): Promise<FormSettings> {
  const { data } = await db.from("app_settings").select("key, value").in("key", FORM_SETTING_KEYS);
  const settings = { ...DEFAULT_FORM_SETTINGS };
  for (const row of data ?? []) {
    if ((FORM_SETTING_KEYS as string[]).includes(row.key)) settings[row.key as keyof FormSettings] = String(row.value ?? "");
  }
  return settings;
}

/** カンマ・改行区切りの設定値を配列にする(空要素は除く) */
export function splitList(v: string): string[] {
  return Array.from(new Set(v.split(/[,\n]/).map((x) => x.trim()).filter(Boolean)));
}
