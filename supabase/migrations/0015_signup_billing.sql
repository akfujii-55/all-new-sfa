-- Web からの申し込みと Stripe 課金。
-- - signup_requests: 申し込みフォームの内容と確認メールのトークン。テナントができる前の情報なので tenant_id は持たず、
--   RLS を有効にしてポリシーを付けない(service role 専用)。
-- - stripe_events: Webhook の二重処理を防ぐための受信済みイベント ID(service role 専用)。
-- - tenants: 期間末での解約予約と、Stripe 側の契約状態を持つ。

create table if not exists public.signup_requests (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  company_name text not null,
  slug text not null,
  contact_name text not null,
  contact_phone text,
  -- 確認リンクのトークンの SHA-256(生のトークンはメールにだけ入れる)
  token_hash text not null unique,
  status text not null default 'pending' check (status in ('pending', 'verified', 'expired')),
  expires_at timestamptz not null,
  verified_at timestamptz,
  tenant_id uuid references public.tenants(id) on delete set null,
  ip text,
  created_at timestamptz not null default now()
);
create index if not exists signup_requests_email_idx on public.signup_requests(lower(email), created_at desc);
create index if not exists signup_requests_ip_idx on public.signup_requests(ip, created_at desc);
alter table public.signup_requests enable row level security;
revoke all on public.signup_requests from public, anon, authenticated;
grant all on public.signup_requests to service_role;

create table if not exists public.stripe_events (
  id text primary key,
  type text not null,
  created_at timestamptz not null default now()
);
alter table public.stripe_events enable row level security;
revoke all on public.stripe_events from public, anon, authenticated;
grant all on public.stripe_events to service_role;

alter table public.tenants add column if not exists cancel_at_period_end boolean not null default false;
-- Stripe の subscription.status をそのまま控える(trialing / active / past_due / canceled / unpaid など)
alter table public.tenants add column if not exists stripe_subscription_status text;
create unique index if not exists tenants_stripe_customer_key on public.tenants(stripe_customer_id) where stripe_customer_id is not null;
