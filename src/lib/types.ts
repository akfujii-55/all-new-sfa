export type DealStage = "appointment" | "proposal_draft" | "proposal" | "considering" | "on_hold" | "won" | "lost";
export type InquiryStatus = "new" | "in_progress" | "converted" | "closed";
export type EmailDirection = "inbound" | "outbound";

/** 案件のステージ(カンバンの列順)。probability は新規作成・ステージ変更時の既定の確度 */
export const DEAL_STAGES: { key: DealStage; label: string; color: string; probability: number }[] = [
  { key: "appointment", label: "アポ取得", color: "bg-sky-500", probability: 30 },
  { key: "proposal_draft", label: "提案書作成中", color: "bg-violet-400", probability: 40 },
  { key: "proposal", label: "提案済み", color: "bg-violet-600", probability: 50 },
  { key: "considering", label: "検討中", color: "bg-amber-500", probability: 60 },
  { key: "on_hold", label: "保留", color: "bg-slate-400", probability: 20 },
  { key: "won", label: "成約", color: "bg-emerald-500", probability: 100 },
  { key: "lost", label: "失注", color: "bg-rose-400", probability: 0 },
];

export const STAGE_PROBABILITY: Record<DealStage, number> = Object.fromEntries(
  DEAL_STAGES.map((s) => [s.key, s.probability]),
) as Record<DealStage, number>;

export const STAGE_LABEL: Record<DealStage, string> = Object.fromEntries(
  DEAL_STAGES.map((s) => [s.key, s.label]),
) as Record<DealStage, string>;

export const INQUIRY_STATUS_LABEL: Record<InquiryStatus, string> = {
  new: "新規",
  in_progress: "対応中",
  converted: "案件化",
  closed: "完了",
};

/** 契約企業(テナント)。業務データはすべて tenant_id で分離される */
export interface Tenant {
  id: string;
  /** 会社 ID(英数字とハイフン) */
  slug: string;
  name: string;
  status: TenantStatus;
  trial_ends_at: string | null;
  /** 申し込み経路 */
  source: "operator" | "signup";
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  address: string | null;
  /** 運営メモ(テナントの利用者には見せない) */
  note: string | null;
  /** 上限: ログインユーザー数(招待中を含む) */
  max_users: number;
  /** 上限: 連携メールアカウント数 */
  max_mail_accounts: number;
  /** 上限: 使用容量(バイト) */
  max_storage_bytes: number;
  billing_status: BillingStatus;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  /** Stripe の subscription.status(trialing / active / past_due / canceled など) */
  stripe_subscription_status: string | null;
  current_period_end: string | null;
  /** 期間末で解約する予定(Stripe の cancel_at_period_end) */
  cancel_at_period_end: boolean;
  created_at: string;
  updated_at: string;
}

export type TenantStatus = "trial" | "active" | "suspended" | "cancelled";

export const TENANT_STATUS_LABEL: Record<TenantStatus, string> = {
  trial: "お試し期間",
  active: "契約中",
  suspended: "停止中",
  cancelled: "解約",
};

export type BillingStatus = "none" | "trialing" | "active" | "past_due" | "cancelled";

export const BILLING_STATUS_LABEL: Record<BillingStatus, string> = {
  none: "未設定",
  trialing: "お試し中",
  active: "課金中",
  past_due: "支払い遅延",
  cancelled: "解約済み",
};

/** テナントの利用量(tenant_usage_of / my_tenant_usage) */
export interface TenantUsage {
  /** ログインできる利用者 + 招待中 */
  users: number;
  pending_invites: number;
  mail_accounts: number;
  emails: number;
  storage_bytes: number;
}

export const GIB = 1024 * 1024 * 1024;

export interface Profile {
  id: string;
  email: string | null;
  full_name: string | null;
  tenant_id: string | null;
  created_at: string;
}

/** 社内の営業担当(自社側)。顧客側の担当者は Contact */
export interface Member {
  id: string;
  profile_id: string | null;
  name: string;
  email: string | null;
  is_active: boolean;
  sort_order: number;
  memo: string | null;
  /** 招待メールを送った日時(ログイン登録が済むと profile_id が入る) */
  invited_at: string | null;
  created_at: string;
  updated_at: string;
}

/** 受信・送信に使うメールアカウント(Gmail やその他の IMAP / SMTP サーバー)。password_enc はサーバー側で暗号化済み */
export interface MailAccount {
  id: string;
  label: string;
  email: string;
  from_name: string | null;
  imap_host: string;
  imap_port: number;
  smtp_host: string;
  smtp_port: number;
  /** ログイン ID がメールアドレスと異なるサーバー用。null ならメールアドレスでログインする */
  login_user: string | null;
  password_enc: string;
  is_active: boolean;
  is_default: boolean;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

/** クライアントに渡す用のアカウント情報(認証情報を含まない) */
export type MailAccountOption = Pick<MailAccount, "id" | "label" | "email" | "is_default">;

/** メール・担当者に付けるタグ(テナントごとに設定画面で管理) */
export interface Tag {
  id: string;
  name: string;
  /** 表示色のキー(src/lib/tags.ts の TAG_COLORS) */
  color: string;
  sort_order: number;
  created_at: string;
}

export interface Company {
  id: string;
  name: string;
  domain: string | null;
  industry: string | null;
  phone: string | null;
  website: string | null;
  address: string | null;
  memo: string | null;
  created_at: string;
  updated_at: string;
}

export interface Contact {
  id: string;
  company_id: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  title: string | null;
  memo: string | null;
  created_at: string;
  updated_at: string;
  company?: Pick<Company, "id" | "name"> | null;
  tags?: Tag[];
}

export interface Deal {
  id: string;
  company_id: string;
  contact_id: string | null;
  inquiry_id: string | null;
  title: string;
  stage: DealStage;
  amount: number;
  probability: number;
  appointment_at: string | null;
  expected_close_date: string | null;
  owner_id: string | null;
  sort_order: number;
  won_at: string | null;
  lost_reason: string | null;
  memo: string | null;
  created_at: string;
  updated_at: string;
  company?: Pick<Company, "id" | "name"> | null;
  contact?: Pick<Contact, "id" | "name" | "email"> | null;
  owner?: Pick<Member, "id" | "name"> | null;
  /** 一覧用: 期限超過の未完了行動の件数(ページ側で集計) */
  overdue_activities?: number;
  /** 一覧用: 今日が期限の未完了行動の件数 */
  today_activities?: number;
}

export interface Email {
  id: string;
  message_id: string | null;
  thread_key: string;
  in_reply_to: string | null;
  direction: EmailDirection;
  from_address: string;
  from_name: string | null;
  to_addresses: string[];
  cc_addresses: string[];
  subject: string | null;
  text_body: string | null;
  html_body: string | null;
  snippet: string | null;
  received_at: string;
  company_id: string | null;
  contact_id: string | null;
  deal_id: string | null;
  inquiry_id: string | null;
  account_id: string | null;
  is_read: boolean;
  imap_uid: number | null;
  created_at: string;
  company?: Pick<Company, "id" | "name"> | null;
  contact?: Pick<Contact, "id" | "name"> | null;
  deal?: Pick<Deal, "id" | "title"> | null;
  attachments?: EmailAttachment[];
}

export interface EmailAttachment {
  id: string;
  email_id: string;
  filename: string;
  content_type: string;
  size: number;
  storage_path: string;
  content_id: string | null;
  is_inline: boolean;
  created_at: string;
}

export interface Inquiry {
  id: string;
  company_id: string | null;
  contact_id: string | null;
  email_id: string | null;
  deal_id: string | null;
  subject: string;
  summary: string | null;
  category: string | null;
  status: InquiryStatus;
  received_at: string;
  created_at: string;
  updated_at: string;
  company?: Pick<Company, "id" | "name"> | null;
  contact?: Pick<Contact, "id" | "name" | "email"> | null;
  deal?: Pick<Deal, "id" | "title"> | null;
  /** このスレッドのメール(emails.inquiry_id で紐付け) */
  emails?: Pick<Email, "id" | "direction" | "from_address" | "from_name" | "subject" | "text_body" | "received_at">[];
}

/** 案件の行動(履歴と Todo)の種類 */
export type ActivityKind = "call" | "email" | "visit" | "quote" | "callback" | "other";

export const ACTIVITY_KINDS: { key: ActivityKind; label: string }[] = [
  { key: "call", label: "電話" },
  { key: "email", label: "メール" },
  { key: "visit", label: "訪問" },
  { key: "quote", label: "見積書作成" },
  { key: "callback", label: "電話折り返し依頼" },
  { key: "other", label: "その他" },
];
export const ACTIVITY_KIND_LABEL: Record<ActivityKind, string> = Object.fromEntries(ACTIVITY_KINDS.map((k) => [k.key, k.label])) as Record<ActivityKind, string>;

/** 案件の行動。due_at が過去で done_at が null なら期限超過 */
export interface DealActivity {
  id: string;
  deal_id: string;
  kind: ActivityKind;
  body: string;
  due_at: string | null;
  done_at: string | null;
  author_id: string | null;
  created_at: string;
  updated_at: string;
  author?: Pick<Profile, "id" | "full_name"> | null;
  deal?: Pick<Deal, "id" | "title"> | null;
}

export interface DealNote {
  id: string;
  deal_id: string;
  author_id: string | null;
  body: string;
  created_at: string;
  author?: Pick<Profile, "id" | "full_name"> | null;
}

export interface Revenue {
  id: string;
  deal_id: string;
  company_id: string;
  year_month: string;
  amount: number;
  memo: string | null;
  created_at: string;
  deal?: Pick<Deal, "id" | "title"> | null;
  company?: Pick<Company, "id" | "name"> | null;
}

export type SystemLogLevel = "info" | "warn" | "error";

/** サーバー側のエラー・警告・定期処理の記録(system_logs) */
export interface SystemLog {
  id: string;
  level: SystemLogLevel;
  source: string;
  message: string;
  detail: Record<string, unknown> | null;
  request_path: string | null;
  user_email: string | null;
  notified: boolean;
  /** null はテナントに属さないシステム全体のログ(運営側だけが Supabase 上で確認する) */
  tenant_id: string | null;
  created_at: string;
}
