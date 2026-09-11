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

export interface Profile {
  id: string;
  email: string | null;
  full_name: string | null;
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

/** 受信・送信に使うメールアカウント(Gmail など)。password_enc はサーバー側で暗号化済み */
export interface MailAccount {
  id: string;
  label: string;
  email: string;
  from_name: string | null;
  imap_host: string;
  imap_port: number;
  smtp_host: string;
  smtp_port: number;
  password_enc: string;
  is_active: boolean;
  is_default: boolean;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

/** クライアントに渡す用のアカウント情報(認証情報を含まない) */
export type MailAccountOption = Pick<MailAccount, "id" | "label" | "email" | "is_default">;

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
  created_at: string;
}
