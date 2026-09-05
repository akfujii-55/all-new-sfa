export type DealStage = "lead" | "appointment" | "proposal" | "negotiation" | "won" | "lost";
export type InquiryStatus = "new" | "in_progress" | "converted" | "closed";
export type EmailDirection = "inbound" | "outbound";

export const DEAL_STAGES: { key: DealStage; label: string; color: string }[] = [
  { key: "lead", label: "リード", color: "bg-slate-400" },
  { key: "appointment", label: "アポ取得", color: "bg-sky-500" },
  { key: "proposal", label: "提案", color: "bg-violet-500" },
  { key: "negotiation", label: "交渉", color: "bg-amber-500" },
  { key: "won", label: "成約", color: "bg-emerald-500" },
  { key: "lost", label: "失注", color: "bg-rose-400" },
];

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
  owner?: Pick<Profile, "id" | "full_name"> | null;
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
  is_read: boolean;
  imap_uid: number | null;
  created_at: string;
  company?: Pick<Company, "id" | "name"> | null;
  contact?: Pick<Contact, "id" | "name"> | null;
  deal?: Pick<Deal, "id" | "title"> | null;
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
