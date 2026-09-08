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

export const DEFAULT_MAIL_SETTINGS: MailSettings = {
  signature_company: "アートトレーディング株式会社",
  signature_email: "support@art-trading.co.jp",
  signature_extra: "",
  reply_subject: "お問い合わせありがとうございます／アートトレーディング",
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
