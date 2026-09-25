/**
 * 新着メールのチャット通知(0033)の型・定数・文面。クライアント(設定画面)からも読むので、サーバー専用のものを import しない。
 * 送信そのものは src/lib/mail/notify.ts。
 */
export const MAX_MAIL_NOTIFICATIONS = 5;

export type MailNotificationKind = "lark" | "slack" | "chatwork" | "webhook";
export type MailNotificationMode = "digest" | "each";

export interface MailNotificationField {
  /** フォームの name(url / secret / room_id) */
  key: "url" | "secret" | "room_id";
  label: string;
  placeholder: string;
  hint: string;
  required: boolean;
  /** 保存後は表示せず、空のままなら変更しない項目 */
  secret?: boolean;
}

export interface MailNotificationKindDef {
  key: MailNotificationKind;
  label: string;
  fields: MailNotificationField[];
  /** 設定手順(入力欄の下に表示) */
  help: string[];
}

export const MAIL_NOTIFICATION_KINDS: MailNotificationKindDef[] = [
  {
    key: "lark",
    label: "Lark",
    fields: [
      { key: "url", label: "Webhook URL", placeholder: "https://open.larksuite.com/open-apis/bot/v2/hook/…", hint: "グループチャットの設定 → Bot → 「Bot を追加」→ カスタム Bot で発行されます", required: true },
      { key: "secret", label: "署名シークレット(任意)", placeholder: "", hint: "Bot の「署名検証」をオンにした場合だけ入力します", required: false, secret: true },
    ],
    help: [
      "Lark で通知を受けたいグループチャットを開き、右上の「…」→ 設定 → Bot → 「Bot を追加」→「カスタム Bot」を選びます。",
      "表示された Webhook URL をコピーしてここに貼り付けます。「署名検証」をオンにした場合は、シークレットも入力します。",
    ],
  },
  {
    key: "slack",
    label: "Slack",
    fields: [
      { key: "url", label: "Incoming Webhook URL", placeholder: "https://hooks.slack.com/services/…", hint: "Slack アプリの Incoming Webhooks で、通知するチャンネルを選んで発行します", required: true },
    ],
    help: [
      "https://api.slack.com/apps で「Create New App」→「From scratch」を選び、ワークスペースを指定します。",
      "「Incoming Webhooks」をオンにして「Add New Webhook to Workspace」→ 通知するチャンネルを選ぶと URL が発行されます。",
    ],
  },
  {
    key: "chatwork",
    label: "Chatwork",
    fields: [
      { key: "secret", label: "API トークン", placeholder: "", hint: "Chatwork の右上メニュー → サービス連携 → API Token で発行します(通知を投稿するユーザーのトークン)", required: true, secret: true },
      { key: "room_id", label: "ルーム ID", placeholder: "123456789", hint: "通知するグループチャットを開いたときの URL「#!rid」に続く数字", required: true },
    ],
    help: [
      "通知用のユーザー(共用アカウントでも可)でログインし、右上の自分の名前 → サービス連携 → API Token を発行します。",
      "通知先のグループチャットを開き、URL の rid に続く数字がルーム ID です。通知用ユーザーがそのルームに参加している必要があります。",
    ],
  },
  {
    key: "webhook",
    label: "その他の Webhook",
    fields: [
      { key: "url", label: "Webhook URL", placeholder: "https://example.com/hooks/…", hint: "{\"text\": \"…\"} を JSON で POST します(Slack 互換の受け口なら動きます)", required: true },
    ],
    help: [
      "Slack 互換の {\"text\"} を受け取れるサービス(Discord の Slack 互換 URL、Mattermost、Zapier / Make の Webhook など)に使えます。",
      "Microsoft Teams はカード形式が必要なため、この欄では送れません。",
    ],
  },
];

export const MAIL_NOTIFICATION_MODES: { key: MailNotificationMode; label: string }[] = [
  { key: "digest", label: "同期ごとにまとめて 1 件(件名を列挙)" },
  { key: "each", label: "メール 1 通につき 1 件" },
];

export function kindDef(kind: string): MailNotificationKindDef | undefined {
  return MAIL_NOTIFICATION_KINDS.find((k) => k.key === kind);
}

/** DB の行(クライアントに渡す形。secret_enc は渡さず has_secret にする) */
export interface MailNotification {
  id: string;
  kind: MailNotificationKind;
  name: string;
  url: string;
  room_id: string | null;
  mail_account_id: string | null;
  mode: MailNotificationMode;
  is_active: boolean;
  last_sent_at: string | null;
  last_error: string | null;
  has_secret: boolean;
  created_at: string;
}

/** 一覧に表示する送り先(URL の末尾だけ見せる) */
export function describeDestination(n: Pick<MailNotification, "kind" | "url" | "room_id">): string {
  if (n.kind === "chatwork") return n.room_id ? `ルーム ${n.room_id}` : "ルーム未設定";
  try {
    const u = new URL(n.url);
    const tail = u.pathname.replace(/\/$/, "").split("/").pop() ?? "";
    return `${u.hostname}/…${tail.slice(-6)}`;
  } catch {
    return n.url;
  }
}

/** 通知に載せる 1 通分の情報 */
export interface NewMailNotice {
  /** emails.id(スレッドを開くリンクに使う) */
  id: string;
  fromName: string | null;
  fromAddress: string;
  subject: string | null;
  companyName: string | null;
  /** 受信したアカウントのメールアドレス */
  accountEmail: string | null;
  /** スレッドを開く URL */
  url: string;
}

/** 件名を列挙するときの上限(初回同期などで大量に入ったときに長くなりすぎないように) */
export const DIGEST_MAX_ITEMS = 10;

function senderLine(m: NewMailNotice): string {
  const who = m.fromName?.trim() || m.fromAddress;
  return m.companyName && !who.includes(m.companyName) ? `${m.companyName} ${who}` : who;
}

function heading(mails: NewMailNotice[]): string {
  const accounts = Array.from(new Set(mails.map((m) => m.accountEmail).filter(Boolean))) as string[];
  const acc = accounts.length === 1 ? `(${accounts[0]})` : "";
  return `📩 新着メール ${mails.length} 件${acc}`;
}

/**
 * 通知の文面を作る。Slack は mrkdwn のリンク、Chatwork は [info] 記法、それ以外(Lark・汎用)はプレーンテキスト。
 * mails は 1 件(each)でも複数(digest)でも同じ形にする。
 */
export function buildNewMailText(kind: MailNotificationKind, mails: NewMailNotice[]): string {
  if (mails.length === 0) return "";
  const shown = mails.slice(0, DIGEST_MAX_ITEMS);
  const rest = mails.length - shown.length;
  const subject = (m: NewMailNotice) => `「${m.subject?.trim() || "(件名なし)"}」`;

  if (kind === "chatwork") {
    const items = shown.map((m) => `${senderLine(m)}\n${subject(m)}\n${m.url}`);
    if (rest > 0) items.push(`…ほか ${rest} 件`);
    return `[info][title]${heading(mails)}[/title]${items.join("\n[hr]\n")}[/info]`;
  }
  if (kind === "slack") {
    const items = shown.map((m) => `• ${senderLine(m)}\n  ${subject(m)}  <${m.url}|開く>`);
    if (rest > 0) items.push(`…ほか ${rest} 件`);
    return `${heading(mails)}\n${items.join("\n")}`;
  }
  const items = shown.map((m) => `・${senderLine(m)}\n  ${subject(m)}\n  ${m.url}`);
  if (rest > 0) items.push(`…ほか ${rest} 件`);
  return `${heading(mails)}\n\n${items.join("\n\n")}`;
}

/** テスト送信・プレビュー用のサンプル */
export function sampleNotices(siteUrl: string, accountEmail: string | null): NewMailNotice[] {
  const base = siteUrl.replace(/\/$/, "") || "https://example.com";
  return [
    { id: "sample-1", fromName: "山田 太郎", fromAddress: "taro@example.co.jp", subject: "在庫管理システムのお見積り依頼", companyName: "株式会社サンプル", accountEmail, url: `${base}/inbox` },
    { id: "sample-2", fromName: "田中 花子", fromAddress: "hanako@example.com", subject: "Re: デモのご相談", companyName: null, accountEmail, url: `${base}/inbox` },
  ];
}
