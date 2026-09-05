-- SFA アプリ 初期スキーマ
create extension if not exists pgcrypto;

-- ---------- 共通: updated_at 自動更新 ----------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------- プロフィール(auth.users と 1:1) ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- 顧客(会社) ----------
create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  domain text unique,
  industry text,
  phone text,
  website text,
  address text,
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger companies_updated_at before update on public.companies
  for each row execute function public.set_updated_at();

-- ---------- 担当者 ----------
create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete set null,
  name text not null,
  email text unique,
  phone text,
  title text,
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists contacts_company_idx on public.contacts(company_id);
create trigger contacts_updated_at before update on public.contacts
  for each row execute function public.set_updated_at();

-- ---------- 案件 ----------
create table if not exists public.deals (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  inquiry_id uuid,
  title text not null,
  stage text not null default 'appointment'
    check (stage in ('lead','appointment','proposal','negotiation','won','lost')),
  amount numeric(14,0) not null default 0,
  probability int not null default 30 check (probability between 0 and 100),
  appointment_at timestamptz,
  expected_close_date date,
  owner_id uuid references public.profiles(id) on delete set null,
  sort_order int not null default 0,
  won_at timestamptz,
  lost_reason text,
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists deals_company_idx on public.deals(company_id);
create index if not exists deals_stage_idx on public.deals(stage, sort_order);
create trigger deals_updated_at before update on public.deals
  for each row execute function public.set_updated_at();

-- ---------- メール(受信・送信) ----------
create table if not exists public.emails (
  id uuid primary key default gen_random_uuid(),
  message_id text unique,
  thread_key text not null,
  in_reply_to text,
  direction text not null check (direction in ('inbound','outbound')),
  from_address text not null,
  from_name text,
  to_addresses text[] not null default '{}',
  cc_addresses text[] not null default '{}',
  subject text,
  text_body text,
  html_body text,
  snippet text,
  received_at timestamptz not null default now(),
  company_id uuid references public.companies(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  deal_id uuid references public.deals(id) on delete set null,
  inquiry_id uuid,
  is_read boolean not null default false,
  imap_uid bigint,
  created_at timestamptz not null default now()
);
create index if not exists emails_thread_idx on public.emails(thread_key, received_at);
create index if not exists emails_deal_idx on public.emails(deal_id);
create index if not exists emails_company_idx on public.emails(company_id);
create index if not exists emails_received_idx on public.emails(received_at desc);

-- ---------- 問い合わせ ----------
create table if not exists public.inquiries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  email_id uuid references public.emails(id) on delete set null,
  deal_id uuid references public.deals(id) on delete set null,
  subject text not null,
  summary text,
  category text,
  status text not null default 'new' check (status in ('new','in_progress','converted','closed')),
  received_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists inquiries_status_idx on public.inquiries(status, received_at desc);
create trigger inquiries_updated_at before update on public.inquiries
  for each row execute function public.set_updated_at();

alter table public.deals
  add constraint deals_inquiry_fk foreign key (inquiry_id) references public.inquiries(id) on delete set null;
alter table public.emails
  add constraint emails_inquiry_fk foreign key (inquiry_id) references public.inquiries(id) on delete set null;

-- ---------- 商談メモ ----------
create table if not exists public.deal_notes (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists deal_notes_deal_idx on public.deal_notes(deal_id, created_at desc);

-- ---------- 売上計上(月次) ----------
create table if not exists public.revenues (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  year_month date not null, -- 月初日で保持
  amount numeric(14,0) not null,
  memo text,
  created_at timestamptz not null default now()
);
create index if not exists revenues_month_idx on public.revenues(year_month);
create index if not exists revenues_deal_idx on public.revenues(deal_id);

-- ---------- メール同期状態 ----------
create table if not exists public.mail_sync_state (
  mailbox text primary key,
  last_uid bigint not null default 0,
  last_synced_at timestamptz,
  last_error text
);

-- ---------- RLS: ログインユーザーは全データにアクセス可(社内ツール想定) ----------
do $$
declare t text;
begin
  foreach t in array array['profiles','companies','contacts','deals','emails','inquiries','deal_notes','revenues','mail_sync_state']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "authenticated_all" on public.%I', t);
    execute format('create policy "authenticated_all" on public.%I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;
