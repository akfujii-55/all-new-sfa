/**
 * メールアカウント連携のプロバイダー種別(設定画面の表示と入力補助用)。
 * 接続自体は IMAP / SMTP のホストとポートだけで決まるので、サーバー側はこの種別に依存しない。
 */
export type MailProvider = "gmail" | "other";

export const GMAIL_HOSTS = { imap_host: "imap.gmail.com", imap_port: 993, smtp_host: "smtp.gmail.com", smtp_port: 465 } as const;

export function providerOf(a: { imap_host: string; smtp_host: string }): MailProvider {
  return a.imap_host === GMAIL_HOSTS.imap_host && a.smtp_host === GMAIL_HOSTS.smtp_host ? "gmail" : "other";
}

export const PROVIDER_LABEL: Record<MailProvider, string> = {
  gmail: "Gmail / Google Workspace",
  other: "その他の IMAP / SMTP サーバー",
};

/** 「その他」を選んだときに参考として見せる、よくあるサーバー設定 */
export const PROVIDER_EXAMPLES: { name: string; imap: string; smtp: string; note?: string }[] = [
  { name: "さくらのレンタルサーバ", imap: "初期ドメイン(例: example.sakura.ne.jp):993", smtp: "同じホスト:587", note: "ログイン ID はメールアドレス" },
  { name: "エックスサーバー", imap: "sv****.xserver.jp:993", smtp: "sv****.xserver.jp:465", note: "サーバーパネルの「メールアカウント設定」に記載" },
  { name: "ロリポップ!", imap: "imap.lolipop.jp:993", smtp: "smtp.lolipop.jp:465" },
  { name: "Yahoo!メール", imap: "imap.mail.yahoo.co.jp:993", smtp: "smtp.mail.yahoo.co.jp:465", note: "「メールソフトでの送受信」を有効にする" },
  { name: "iCloud メール", imap: "imap.mail.me.com:993", smtp: "smtp.mail.me.com:587", note: "App 用パスワードが必要" },
];
