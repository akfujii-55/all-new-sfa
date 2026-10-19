-- 一斉配信(メーリングリスト、0043)。
-- 配信リスト(mailing_lists)に担当者(contacts)を出し入れし、配信(mail_campaigns)はリストを選んで自社の SMTP アカウントから 1 通ずつ個別に送る。
-- 送った 1 通ずつは emails には入れず、宛先ごとの結果を mail_campaign_recipients に残す。
-- 特定電子メール法に合わせ、本文の末尾に送信者情報(app_settings.campaign_footer)と配信停止リンク(/u/<token>)を付け、
-- 停止した担当者(contacts.unsubscribed_at)は以後の配信から外す(個別の返信は止めない)。

-- 担当者: 配信停止と、配信停止リンク用のトークン(相手ごと。推測されない 122 ビットの乱数)
alter table public.contacts
  add column if not exists unsubscribed_at timestamptz,
  add column if not exists unsubscribe_token text not null default replace(gen_random_uuid()::text, '-', '');
create unique index if not exists contacts_unsubscribe_token_key on public.contacts(unsubscribe_token);

-- 配信リスト(テナントごと最大 50)
create table if not exists public.mailing_lists (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null check (btrim(name) <> '' and char_length(name) <= 50),
  description text check (char_length(description) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, name)
);
create index if not exists mailing_lists_tenant_idx on public.mailing_lists(tenant_id, created_at);

-- リストの担当者(同じ担当者は 1 回だけ)
create table if not exists public.mailing_list_contacts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  list_id uuid not null references public.mailing_lists(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (tenant_id, list_id, contact_id)
);
create index if not exists mailing_list_contacts_list_idx on public.mailing_list_contacts(list_id);
create index if not exists mailing_list_contacts_contact_idx on public.mailing_list_contacts(contact_id);

-- 配信
create table if not exists public.mail_campaigns (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  -- 配信先のリスト。リストを消しても配信の記録は残す(名前は list_name に控える)
  list_id uuid references public.mailing_lists(id) on delete set null,
  list_name text not null default '',
  -- 送信元のメールアカウント。消したら以後は送れない(status を failed で止める)
  account_id uuid references public.mail_accounts(id) on delete set null,
  subject text not null check (btrim(subject) <> '' and char_length(subject) <= 200),
  body text not null check (char_length(body) <= 20000),
  -- draft=下書き / scheduled=予約(scheduled_at に送り始める) / sending=送信中 / paused=一時停止 / done=完了 / cancelled=取り消し
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'sending', 'paused', 'done', 'cancelled')),
  scheduled_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  -- 定期処理の重複実行を防ぐロック(10 分で期限切れ)
  locked_at timestamptz,
  total_count int not null default 0,
  sent_count int not null default 0,
  failed_count int not null default 0,
  skipped_count int not null default 0,
  last_error text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists mail_campaigns_tenant_idx on public.mail_campaigns(tenant_id, created_at desc);
create index if not exists mail_campaigns_due_idx on public.mail_campaigns(status, scheduled_at) where status in ('scheduled', 'sending');

-- 配信の宛先(予約・開始時にリストから写す。差し込みに使う名前・会社名も控える)
create table if not exists public.mail_campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  campaign_id uuid not null references public.mail_campaigns(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  email text not null,
  name text not null default '',
  company_name text not null default '',
  -- pending=未送信 / sent=送信済み / failed=失敗 / skipped=除外(配信停止・アドレス無し・重複)
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'skipped')),
  reason text,
  message_id text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (campaign_id, email)
);
create index if not exists mail_campaign_recipients_campaign_idx on public.mail_campaign_recipients(campaign_id, status);
-- 1 日の送信数(アカウントごと)を数えるため
create index if not exists mail_campaign_recipients_sent_idx on public.mail_campaign_recipients(tenant_id, sent_at) where sent_at is not null;

-- トリガー・RLS(他の業務テーブルと同じ)
do $$
declare t text;
begin
  foreach t in array array['mailing_lists', 'mailing_list_contacts', 'mail_campaigns', 'mail_campaign_recipients'] loop
    execute format('drop trigger if exists set_tenant_id on public.%I', t);
    execute format('create trigger set_tenant_id before insert on public.%I for each row execute function public.set_tenant_id()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "tenant_isolation" on public.%I', t);
    execute format('create policy "tenant_isolation" on public.%I for all to authenticated using (tenant_id = (select public.current_tenant_id())) with check (tenant_id = (select public.current_tenant_id()))', t);
  end loop;
end $$;
drop trigger if exists mailing_lists_updated_at on public.mailing_lists;
create trigger mailing_lists_updated_at before update on public.mailing_lists for each row execute function public.set_updated_at();
drop trigger if exists mail_campaigns_updated_at on public.mail_campaigns;
create trigger mail_campaigns_updated_at before update on public.mail_campaigns for each row execute function public.set_updated_at();

-- 配信停止(公開ページ /u/<token>、ログイン無し)。トークンだけで相手を特定するので security definer で絞って返す。
-- 返すのは伏せたメールアドレスと会社(テナント)名だけ。
create or replace function public.unsubscribe_peek(p_token text)
returns table (masked_email text, tenant_name text, unsubscribed boolean)
language sql security definer set search_path = public stable as $$
  select
    regexp_replace(c.email, '^(.).*(@.*)$', '\1***\2') as masked_email,
    t.name as tenant_name,
    c.unsubscribed_at is not null as unsubscribed
  from public.contacts c
  join public.tenants t on t.id = c.tenant_id
  where c.unsubscribe_token = p_token and p_token ~ '^[0-9a-f]{32}$' and c.email is not null
$$;

create or replace function public.unsubscribe_apply(p_token text)
returns boolean
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if p_token !~ '^[0-9a-f]{32}$' then return false; end if;
  update public.contacts set unsubscribed_at = coalesce(unsubscribed_at, now())
  where unsubscribe_token = p_token and email is not null
  returning id into v_id;
  return v_id is not null;
end $$;

revoke all on function public.unsubscribe_peek(text) from public;
revoke all on function public.unsubscribe_apply(text) from public;
grant execute on function public.unsubscribe_peek(text) to anon, authenticated, service_role;
grant execute on function public.unsubscribe_apply(text) to anon, authenticated, service_role;
