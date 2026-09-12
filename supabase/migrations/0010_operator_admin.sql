-- 運営管理(テナントの連絡先・上限・課金状態、運営者、料金設定、利用量の集計)
--
-- - tenants に連絡先(担当者名・メール・電話・住所)、上限(ユーザー数・メールアカウント数・容量)、課金状態、運営メモを追加。
-- - operators: 運営管理画面(/admin)に入れる auth ユーザー。is_operator() で判定する。
-- - operator_settings: 月額料金やオプション単価、新規テナントの既定上限(運営だけが読み書き。service role 専用)。
-- - tenant_usage_of(tenant) / tenant_usage(ビュー): 利用量(ユーザー数・メールアカウント数・メール件数・使用容量)。
--   my_tenant_usage() はログインユーザーが自テナントの利用量を見るためのもの(上限チェックに使う)。

-- ---------- tenants: 連絡先・上限・課金 ----------
alter table public.tenants add column if not exists contact_name text;
alter table public.tenants add column if not exists contact_email text;
alter table public.tenants add column if not exists contact_phone text;
alter table public.tenants add column if not exists address text;
alter table public.tenants add column if not exists note text;
alter table public.tenants add column if not exists max_users int not null default 1 check (max_users >= 1);
alter table public.tenants add column if not exists max_mail_accounts int not null default 1 check (max_mail_accounts >= 1);
alter table public.tenants add column if not exists max_storage_bytes bigint not null default 1073741824 check (max_storage_bytes > 0);
alter table public.tenants add column if not exists billing_status text not null default 'none'
  check (billing_status in ('none', 'trialing', 'active', 'past_due', 'cancelled'));
alter table public.tenants add column if not exists stripe_customer_id text;
alter table public.tenants add column if not exists stripe_subscription_id text;
alter table public.tenants add column if not exists current_period_end timestamptz;
-- 申し込み経路(operator: 運営が作成 / signup: Web 申し込み)
alter table public.tenants add column if not exists source text not null default 'operator' check (source in ('operator', 'signup'));

-- 自社(最初のテナント)は上限を十分に大きくし、課金対象外にする
update public.tenants
set max_users = 99,
    max_mail_accounts = 20,
    max_storage_bytes = 50 * 1073741824::bigint,
    billing_status = 'active',
    contact_email = coalesce(contact_email, (select email from public.profiles where tenant_id = tenants.id order by created_at limit 1)),
    contact_name = coalesce(contact_name, (select full_name from public.profiles where tenant_id = tenants.id order by created_at limit 1))
where id = (select id from public.tenants order by created_at limit 1);

-- ---------- 運営者 ----------
create table if not exists public.operators (
  user_id uuid primary key references auth.users(id) on delete cascade,
  note text,
  created_at timestamptz not null default now()
);
alter table public.operators enable row level security;
drop policy if exists "operators_self" on public.operators;
create policy "operators_self" on public.operators for select to authenticated using (user_id = auth.uid());

-- 最初の運営者: 自社の管理者
insert into public.operators (user_id, note)
select id, '初期運営者' from auth.users where email = 'akfujii@art-trading.co.jp'
on conflict (user_id) do nothing;

create or replace function public.is_operator()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.operators where user_id = auth.uid());
$$;
grant execute on function public.is_operator() to authenticated, service_role;

-- ---------- 運営側の設定(料金・既定の上限) ----------
create table if not exists public.operator_settings (
  key text primary key,
  value text not null default '',
  updated_at timestamptz not null default now()
);
drop trigger if exists operator_settings_updated_at on public.operator_settings;
create trigger operator_settings_updated_at before update on public.operator_settings
  for each row execute function public.set_updated_at();
-- ポリシー無しで RLS 有効 = service role 以外は読めない
alter table public.operator_settings enable row level security;

insert into public.operator_settings (key, value) values
  ('price_base_monthly', '10000'),          -- 月額基本料金(税抜・円)。メールアカウント 1、ユーザー 1、容量 1GB を含む
  ('price_per_extra_mail_account', '5000'), -- メールアカウント 1 件追加ごとの月額
  ('price_per_extra_user', '1000'),         -- ユーザー 1 名追加ごとの月額
  ('price_per_extra_storage_gb', '0'),      -- 容量 1GB 追加ごとの月額(未定なら 0)
  ('trial_days', '90'),                     -- お試し期間(日)
  ('default_max_users', '1'),
  ('default_max_mail_accounts', '1'),
  ('default_max_storage_gb', '1')
on conflict (key) do nothing;

-- ---------- 利用量 ----------
-- ユーザー数 = ログインできる利用者(profiles)+ 招待中(招待済みで未ログインの営業担当者)
-- 使用容量 = 添付ファイルのサイズ + メール本文(テキスト・HTML)のバイト数
create or replace function public.tenant_usage_of(p_tenant uuid)
returns table (users bigint, pending_invites bigint, mail_accounts bigint, emails bigint, storage_bytes bigint)
language sql stable security definer set search_path = public as $$
  select
    (select count(*) from public.profiles p where p.tenant_id = p_tenant)
      + (select count(*) from public.members m where m.tenant_id = p_tenant and m.profile_id is null and m.invited_at is not null) as users,
    (select count(*) from public.members m where m.tenant_id = p_tenant and m.profile_id is null and m.invited_at is not null) as pending_invites,
    (select count(*) from public.mail_accounts a where a.tenant_id = p_tenant) as mail_accounts,
    (select count(*) from public.emails e where e.tenant_id = p_tenant) as emails,
    (select coalesce(sum(ea.size), 0) from public.email_attachments ea where ea.tenant_id = p_tenant)
      + (select coalesce(sum(octet_length(coalesce(e.text_body, '')) + octet_length(coalesce(e.html_body, ''))), 0) from public.emails e where e.tenant_id = p_tenant) as storage_bytes;
$$;
revoke all on function public.tenant_usage_of(uuid) from public, anon, authenticated;
grant execute on function public.tenant_usage_of(uuid) to service_role;

-- ログインユーザーが自テナントの利用量を見る(上限チェック用)
create or replace function public.my_tenant_usage()
returns table (users bigint, pending_invites bigint, mail_accounts bigint, emails bigint, storage_bytes bigint)
language sql stable security definer set search_path = public as $$
  select * from public.tenant_usage_of(public.current_tenant_id());
$$;
grant execute on function public.my_tenant_usage() to authenticated, service_role;

-- 運営管理画面の一覧用(service role 専用)
create or replace view public.tenant_usage as
select t.id as tenant_id, u.users, u.pending_invites, u.mail_accounts, u.emails, u.storage_bytes
from public.tenants t, lateral public.tenant_usage_of(t.id) u;
revoke all on public.tenant_usage from public, anon, authenticated;
grant select on public.tenant_usage to service_role;

-- ---------- create_tenant: 連絡先・上限・お試し期間を受け取る ----------
drop function if exists public.create_tenant(text, text, text, text);
create or replace function public.create_tenant(
  p_name text,
  p_slug text,
  p_owner_name text,
  p_owner_email text,
  p_contact_phone text default null,
  p_address text default null,
  p_max_users int default null,
  p_max_mail_accounts int default null,
  p_max_storage_bytes bigint default null,
  p_trial_days int default null,
  p_source text default 'operator'
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid;
begin
  if p_name is null or btrim(p_name) = '' then raise exception '会社名を指定してください'; end if;
  if p_owner_email is null or position('@' in p_owner_email) = 0 then raise exception '管理者のメールアドレスが正しくありません'; end if;

  insert into public.tenants (
    name, slug, status, billing_status, source,
    contact_name, contact_email, contact_phone, address,
    max_users, max_mail_accounts, max_storage_bytes, trial_ends_at
  ) values (
    btrim(p_name), lower(btrim(p_slug)), 'trial', 'trialing', coalesce(p_source, 'operator'),
    nullif(btrim(coalesce(p_owner_name, '')), ''), lower(btrim(p_owner_email)), nullif(btrim(coalesce(p_contact_phone, '')), ''), nullif(btrim(coalesce(p_address, '')), ''),
    coalesce(p_max_users, (select value::int from public.operator_settings where key = 'default_max_users'), 1),
    coalesce(p_max_mail_accounts, (select value::int from public.operator_settings where key = 'default_max_mail_accounts'), 1),
    coalesce(p_max_storage_bytes, (select (value::numeric * 1073741824)::bigint from public.operator_settings where key = 'default_max_storage_gb'), 1073741824),
    now() + make_interval(days => coalesce(p_trial_days, (select value::int from public.operator_settings where key = 'trial_days'), 90))
  )
  returning id into v_tenant;

  insert into public.members (tenant_id, name, email, is_active, sort_order)
  values (v_tenant, coalesce(nullif(btrim(coalesce(p_owner_name, '')), ''), split_part(p_owner_email, '@', 1)), lower(btrim(p_owner_email)), true, 0);

  insert into public.app_settings (tenant_id, key, value) values
    (v_tenant, 'signature_company', btrim(p_name)),
    (v_tenant, 'signature_email', lower(btrim(p_owner_email))),
    (v_tenant, 'signature_extra', ''),
    (v_tenant, 'reply_subject', 'お問い合わせありがとうございます／' || btrim(p_name)),
    (v_tenant, 'alert_emails', lower(btrim(p_owner_email)));

  return v_tenant;
end $$;
revoke all on function public.create_tenant(text, text, text, text, text, text, int, int, bigint, int, text) from public, anon, authenticated;
grant execute on function public.create_tenant(text, text, text, text, text, text, int, int, bigint, int, text) to service_role;
