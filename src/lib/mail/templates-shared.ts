/**
 * アプリが送る招待メール・パスワード再設定メールの文面(全テナント共通)。
 * 運営管理(/admin/mail-templates)で編集した内容は mail_templates に保存され、無ければ既定文面を使う。
 * 本文・件名には {{name}} などの差し込み項目を書ける。
 */

export type MailTemplateKey = "tenant_invite" | "operator_invite" | "member_invite" | "signup_confirm" | "password_reset";

export const MAIL_TEMPLATE_KEYS: MailTemplateKey[] = ["signup_confirm", "tenant_invite", "operator_invite", "member_invite", "password_reset"];

export interface MailTemplate {
  subject: string;
  body: string;
}

export interface MailTemplateVars {
  /** 宛名 */
  name: string;
  /** 会社名(テナント名) */
  company: string;
  /** 招待した人の名前 */
  inviter: string;
  /** 招待リンク */
  link: string;
  /** リンクの有効期限(例: 24 時間) */
  expires: string;
  /** アプリ名 */
  app_name: string;
}

export const APP_NAME = "SFA";
export const INVITE_EXPIRES = "24 時間";

export const PLACEHOLDERS: { key: keyof MailTemplateVars; label: string }[] = [
  { key: "name", label: "宛名(招待される人の名前)" },
  { key: "company", label: "会社名(テナント名)" },
  { key: "inviter", label: "招待した人の名前" },
  { key: "link", label: "招待・再設定リンク(必須)" },
  { key: "expires", label: "リンクの有効期限" },
  { key: "app_name", label: "アプリ名" },
];

export const MAIL_TEMPLATE_META: Record<MailTemplateKey, { label: string; description: string }> = {
  tenant_invite: {
    label: "テナント作成時の管理者への招待",
    description: "運営管理でテナントを作成したとき、その会社の最初の管理者に運営側のメールアカウントから送ります。",
  },
  operator_invite: {
    label: "運営者への招待",
    description: "ユーザー管理で運営者を招待したときに、運営側のメールアカウントから送ります。",
  },
  member_invite: {
    label: "営業担当者への招待",
    description: "各テナントの営業担当者ページで「招待」を押したときに、そのテナントのメールアカウントから送ります。",
  },
  signup_confirm: {
    label: "Web 申し込みの確認メール",
    description: "申し込みフォームの送信直後に、入力されたメールアドレス宛に運営側のメールアカウントから送ります。リンクを開くとアカウントが開設されます。",
  },
  password_reset: {
    label: "パスワード再設定",
    description: "ログイン画面の「パスワードを忘れた方」から送ります。送信元はその利用者の会社のメールアカウント(無ければ運営側のメールアカウント)です。",
  },
};

export const DEFAULT_MAIL_TEMPLATES: Record<MailTemplateKey, MailTemplate> = {
  signup_confirm: {
    subject: "【{{app_name}}】お申し込みの確認",
    body: [
      "{{name}} 様",
      "",
      "営業支援ツール「{{app_name}}」にお申し込みいただきありがとうございます。",
      "以下のリンクを開いて「アカウントを開設する」を押すと、{{company}} のアカウントが作成され、パスワードの設定に進みます。",
      "",
      "{{link}}",
      "",
      "※ リンクの有効期限は {{expires}} です。期限が切れた場合はもう一度お申し込みください。",
      "※ 心当たりがない場合はこのメールを破棄してください。アカウントは作成されません。",
    ].join("\n"),
  },
  tenant_invite: {
    subject: "【{{app_name}}】{{company}} のアカウントを作成しました",
    body: [
      "{{name}} 様",
      "",
      "営業支援ツール「{{app_name}}」に {{company}} のアカウントを作成しました。",
      "以下のリンクを開いてパスワードを設定すると、ログインできるようになります。",
      "",
      "{{link}}",
      "",
      "※ リンクの有効期限は {{expires}} です。期限が切れた場合はご連絡ください。",
      "※ 心当たりがない場合はこのメールを破棄してください。",
    ].join("\n"),
  },
  operator_invite: {
    subject: "【{{app_name}}】運営管理への招待",
    body: [
      "{{name}} 様",
      "",
      "営業支援ツール「{{app_name}}」の運営管理に招待されました。",
      "以下のリンクを開いてパスワードを設定すると、ログインして運営管理を利用できるようになります。",
      "",
      "{{link}}",
      "",
      "※ リンクの有効期限は {{expires}} です。期限が切れた場合は再送を依頼してください。",
      "※ 心当たりがない場合はこのメールを破棄してください。",
    ].join("\n"),
  },
  password_reset: {
    subject: "【{{app_name}}】パスワード再設定のご案内",
    body: [
      "{{name}} 様",
      "",
      "営業支援ツール「{{app_name}}」のパスワード再設定の依頼を受け付けました。",
      "以下のリンクを開いて、新しいパスワードを設定してください。",
      "",
      "{{link}}",
      "",
      "※ リンクの有効期限は {{expires}} です。期限が切れた場合はログイン画面からもう一度お手続きください。",
      "※ 心当たりがない場合はこのメールを破棄してください。パスワードは変更されません。",
    ].join("\n"),
  },
  member_invite: {
    subject: "【{{app_name}}】{{inviter}} さんから招待が届いています",
    body: [
      "{{name}} 様",
      "",
      "{{inviter}} さんから営業支援ツール「{{app_name}}」({{company}})に招待されました。",
      "以下のリンクを開いてパスワードを設定すると、ログインできるようになります。",
      "",
      "{{link}}",
      "",
      "※ リンクの有効期限は {{expires}} です。期限が切れた場合は招待をもう一度送ってもらってください。",
      "※ 心当たりがない場合はこのメールを破棄してください。",
    ].join("\n"),
  },
};

/** {{key}} を値に置き換える。未知の項目はそのまま残す */
export function renderTemplate(text: string, vars: Partial<MailTemplateVars>): string {
  return text.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (m, k: string) => {
    const v = (vars as Record<string, string | undefined>)[k];
    return v === undefined ? m : v;
  });
}

/** 保存前の検証。本文に {{link}} が無いとリンク無しの招待メールになるので拒否する */
export function validateTemplate(t: MailTemplate): string | null {
  if (!t.subject.trim()) return "件名を入力してください";
  if (!t.body.trim()) return "本文を入力してください";
  if (!/\{\{\s*link\s*\}\}/.test(t.body)) return "本文にリンク {{link}} を入れてください";
  const unknown = [...t.body.matchAll(/\{\{\s*([a-z_]+)\s*\}\}/g), ...t.subject.matchAll(/\{\{\s*([a-z_]+)\s*\}\}/g)]
    .map((m) => m[1])
    .filter((k) => !PLACEHOLDERS.some((p) => p.key === k));
  if (unknown.length) return `使えない差し込み項目があります: ${[...new Set(unknown)].map((k) => `{{${k}}}`).join(", ")}`;
  return null;
}

