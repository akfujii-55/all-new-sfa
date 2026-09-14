-- 問い合わせに「担当者(自社の営業担当)」と「メモ(単一欄)」を追加する。
-- タグは別体系にせず、紐付くメール(emails.inquiry_id)の email_tags をそのまま表示・編集する。
alter table public.inquiries
  add column if not exists owner_id uuid references public.members(id) on delete set null,
  add column if not exists memo text,
  add column if not exists memo_updated_at timestamptz,
  add column if not exists memo_updated_by uuid references public.profiles(id) on delete set null;

create index if not exists inquiries_owner_idx on public.inquiries(owner_id);
