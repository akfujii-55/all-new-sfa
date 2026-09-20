/**
 * メールアカウント連携のプロバイダー種別(設定画面の表示と入力補助用)。
 * 接続自体は IMAP / SMTP のホストとポートだけで決まるので、サーバー側はこの種別に依存しない。
 */
export type MailProvider = "gmail" | "other" | "forward";

export const GMAIL_HOSTS = { imap_host: "imap.gmail.com", imap_port: 993, smtp_host: "smtp.gmail.com", smtp_port: 465 } as const;

export function providerOf(a: { imap_host: string; smtp_host: string; receive_mode?: "imap" | "forward" | null }): MailProvider {
  // 転送で受信するアカウントは IMAP を使わない(受け口アドレスへの自動転送 + SMTP 送信)
  if (a.receive_mode === "forward") return "forward";
  return a.imap_host === GMAIL_HOSTS.imap_host && a.smtp_host === GMAIL_HOSTS.smtp_host ? "gmail" : "other";
}

export const PROVIDER_LABEL: Record<MailProvider, string> = {
  gmail: "Gmail / Google Workspace",
  other: "その他の IMAP / SMTP サーバー",
  forward: "メール転送で受信(IMAP が使えない場合)+ SMTP で送信",
};

/** 受け口アドレスへの自動転送の設定手順(保存後の案内と一覧の行に表示) */
export const FORWARD_GUIDES: { name: string; steps: string[] }[] = [
  {
    name: "Microsoft 365",
    steps: [
      "Outlook on the web の 設定 → メール → 転送 を開きます。",
      "「転送を有効にする」をオンにして、転送先に受け口アドレスを貼り付けます。",
      "「転送されたメッセージのコピーを保持する」にチェックして保存します。",
      "管理者が外部への自動転送を禁止している場合は、Microsoft 365 管理センターで許可が必要です。",
    ],
  },
  {
    name: "さくら",
    steps: [
      "サーバーコントロールパネル → メール → メール一覧 → 対象アドレスの「設定」を開きます。",
      "「転送先アドレス」に受け口アドレスを追加します。",
      "「メールボックスに残す」を選んで保存します。",
    ],
  },
  {
    name: "エックスサーバー",
    steps: [
      "サーバーパネル → メール → メールの振り分け / 転送設定 を開きます。",
      "対象アドレスの「転送」で受け口アドレスを追加します。",
      "「メールボックスに残すかどうか」は「残す」を選びます。",
    ],
  },
  {
    name: "その他",
    steps: [
      "ご利用のメールサービスの「自動転送」「転送設定」を開きます。",
      "転送先に受け口アドレスを登録します(メールはサーバーに残す設定にします)。",
      "転送先の確認メールが送られるサービスでは、「今すぐ同期」のあとメール一覧に届く確認メールのリンクを開きます。",
    ],
  },
];

/** 「その他」を選んだときに参考として見せる、よくあるサーバー設定 */
export const PROVIDER_EXAMPLES: { name: string; imap: string; smtp: string; note?: string }[] = [
  { name: "さくらのレンタルサーバ", imap: "初期ドメイン(例: example.sakura.ne.jp):993", smtp: "同じホスト:587", note: "ログイン ID はメールアドレス" },
  { name: "エックスサーバー", imap: "sv****.xserver.jp:993", smtp: "sv****.xserver.jp:465", note: "サーバーパネルの「メールアカウント設定」に記載" },
  { name: "ロリポップ!", imap: "imap.lolipop.jp:993", smtp: "smtp.lolipop.jp:465" },
  { name: "Yahoo!メール", imap: "imap.mail.yahoo.co.jp:993", smtp: "smtp.mail.yahoo.co.jp:465", note: "「メールソフトでの送受信」を有効にする" },
  { name: "iCloud メール", imap: "imap.mail.me.com:993", smtp: "smtp.mail.me.com:587", note: "App 用パスワードが必要" },
];
