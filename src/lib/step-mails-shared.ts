/**
 * ステップメール(0030)の型と差し込み項目。クライアント部品からも読むので、サーバー専用のものは import しない。
 * 送信の判定と実行は src/lib/step-mails.ts。
 */

export interface StepMail {
  id: string;
  /** テナント作成から何日後に送るか(0 = 当日) */
  day_offset: number;
  name: string;
  subject: string;
  body: string;
  /** 課金開始(カード登録)後のテナントにも送る */
  send_after_paid: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type StepMailLogStatus = "sent" | "failed" | "skipped";

export interface StepMailLog {
  id: string;
  tenant_id: string;
  step_id: string;
  status: StepMailLogStatus;
  to_email: string | null;
  error: string | null;
  due_on: string;
  sent_at: string;
  step?: Pick<StepMail, "id" | "day_offset" | "name"> | null;
}

export const STEP_MAIL_LOG_STATUS_LABEL: Record<StepMailLogStatus, string> = {
  sent: "送信済み",
  failed: "失敗",
  skipped: "見送り",
};

/** 差し込み項目 */
export interface StepMailVars {
  name: string;
  company: string;
  app_name: string;
  login_link: string;
  billing_link: string;
  manual_link: string;
  trial_end: string;
  days_left: string;
}

export const STEP_MAIL_PLACEHOLDERS: { key: keyof StepMailVars; label: string }[] = [
  { key: "name", label: "担当者名(テナントの連絡先)" },
  { key: "company", label: "会社名(テナント名)" },
  { key: "app_name", label: "アプリ名" },
  { key: "login_link", label: "ログイン URL" },
  { key: "billing_link", label: "お支払い設定の URL" },
  { key: "manual_link", label: "マニュアルの URL" },
  { key: "trial_end", label: "お試し期限の日付" },
  { key: "days_left", label: "お試し期限までの日数" },
];

/** プレビュー・テスト送信に使うサンプルの値 */
export const STEP_MAIL_SAMPLE_VARS: StepMailVars = {
  name: "山田 太郎",
  company: "株式会社サンプル",
  app_name: "SFA",
  login_link: "https://example.com/login",
  billing_link: "https://example.com/settings/billing",
  manual_link: "https://example.com/docs/manual",
  trial_end: "2026年10月22日",
  days_left: "23",
};

export function renderStepMail(text: string, vars: StepMailVars): string {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k: string) => {
    const v = (vars as unknown as Record<string, string>)[k];
    return v === undefined ? m : v;
  });
}

/** 予定日を過ぎてもこの日数未満なら送る(cron が止まった翌日に追いつく)。これ以上過ぎた回は送らずに「見送り」にする */
export const STEP_MAIL_GRACE_DAYS = 2;

/** 送信元の設定(operator_settings の step_mail_* )。空文字は「既定のアカウント / アカウントの値を使う」 */
export interface StepMailSenderSettings {
  /** 送信に使う運営側テナントのメールアカウント id。空なら既定のアカウント */
  account_id: string;
  /** 差出人アドレスの上書き。空ならアカウントのアドレス */
  from_email: string;
  /** 差出人名の上書き。空ならアカウントの差出人名 */
  from_name: string;
}

/** 送信元の選択肢に出す運営側のメールアカウント(パスワード等は含めない) */
export interface StepMailAccountOption {
  id: string;
  label: string;
  email: string;
  from_name: string;
  is_default: boolean;
}
