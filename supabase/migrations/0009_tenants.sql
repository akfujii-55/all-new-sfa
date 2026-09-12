-- マルチテナント化(共有 DB + tenant_id 列 + RLS)
--
-- 方針:
-- - tenants(契約企業)を追加し、業務データの全テーブルに tenant_id を持たせる。
-- - ログインユーザーのテナントは profiles.tenant_id で決まる。current_tenant_id() が
--   「JWT の tenant_id クレーム(サーバー内部のテナント用クライアント)」→「profiles.tenant_id(ログインユーザー)」の順に解決する。
-- - insert 時に tenant_id が無ければトリガーが current_tenant_id() で補うので、既存のアプリコードは原則そのまま動く。
--   テナントを特定できない場合(service role で tenant_id を渡していない等)は例外にして、別テナントへの混入を防ぐ。
-- - RLS は「自分のテナントの行だけ」に置き換える。system_logs は tenant_id が null の行(システム全体のログ)を持てる。
-- - 既存データはすべて最初のテナント(自社)に紐付ける。
-- - Storage(email-attachments)のパスは <tenant_id>/... に変える。既存オブジェクトの移動は
--   scripts/migrate-attachments-to-tenant.mjs で行う(S3 側のキーが名前に依存するため SQL では動かせない)。

-- ---------- テナント ----------
create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  -- 会社 ID(申し込み時に決める英数字の識別子。URL やサポート窓口での識別に使う)
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'),
  name text not null,
  status text not null default 'trial' check (status in ('trial', 'active', 'suspended', 'cancelled')),
  trial_ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists tenants_updated_at on public.tenants;
create trigger tenants_updated_at before update on public.tenants
  for each row execute function public.set_updated_at();

-- 既存データの受け皿となる最初のテナント(自社)。テナントが 1 件も無いときだけ作る
insert into public.tenants (slug, name, status)
select 'art-trading', coalesce((select value from public.app_settings where key = 'signature_company' and value <> ''), 'アートトレーディング株式会社'), 'active'
where not exists (select 1 from public.tenants);

-- ---------- ログインユーザーの所属テナント ----------
alter table public.profiles add column if not exists tenant_id uuid references public.tenants(id) on delete set null;
update public.profiles set tenant_id = (select id from public.tenants order by created_at limit 1) where tenant_id is null;
create index if not exists profiles_tenant_idx on public.profiles(tenant_id);

-- 現在のテナントを返す。
-- 1. JWT に tenant_id クレームがあればそれ(サーバー内部で作るテナント用クライアント。cron の同期など)
-- 2. ログインユーザーなら profiles.tenant_id
-- どちらも無ければ null(service role で tenant_id を渡していない場合など)
create or replace function public.current_tenant_id()
returns uuid
language sql stable security definer set search_path = public as $$
  select coalesce(
    nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'tenant_id', '')::uuid,
    (select p.tenant_id from public.profiles p where p.id = auth.uid())
  );
$$;
grant execute on function public.current_tenant_id() to anon, authenticated, service_role;

-- ---------- 業務テーブルに tenant_id を追加し、既存行を最初のテナントへ ----------
do $$
declare
  t text;
  first_tenant uuid := (select id from public.tenants order by created_at limit 1);
begin
  foreach t in array array[
    'companies', 'contacts', 'deals', 'emails', 'inquiries', 'deal_notes', 'revenues',
    'mail_sync_state', 'members', 'mail_accounts', 'app_settings', 'email_attachments', 'system_logs'
  ]
  loop
    execute format('alter table public.%I add column if not exists tenant_id uuid references public.tenants(id) on delete cascade', t);
    execute format('update public.%I set tenant_id = %L where tenant_id is null', t, first_tenant);
    -- system_logs だけは tenant_id null(システム全体のログ)を許す
    if t <> 'system_logs' then
      execute format('alter table public.%I alter column tenant_id set not null', t);
    end if;
    execute format('create index if not exists %I on public.%I(tenant_id)', t || '_tenant_idx', t);
  end loop;
end $$;

-- ---------- 一意制約をテナント内で一意に ----------
alter table public.companies drop constraint if exists companies_domain_key;
create unique index if not exists companies_tenant_domain_key on public.companies(tenant_id, domain);

alter table public.contacts drop constraint if exists contacts_email_key;
create unique index if not exists contacts_tenant_email_key on public.contacts(tenant_id, email);

alter table public.emails drop constraint if exists emails_message_id_key;
create unique index if not exists emails_tenant_message_id_key on public.emails(tenant_id, message_id);

alter table public.mail_accounts drop constraint if exists mail_accounts_email_key;
create unique index if not exists mail_accounts_tenant_email_key on public.mail_accounts(tenant_id, email);

-- app_settings は (tenant_id, key) を主キーにする(アプリ側の upsert は onConflict: "tenant_id,key")
alter table public.app_settings drop constraint if exists app_settings_pkey;
alter table public.app_settings add primary key (tenant_id, key);

-- ---------- insert 時に tenant_id を補うトリガー ----------
create or replace function public.set_tenant_id()
returns trigger language plpgsql as $$
begin
  if new.tenant_id is null then
    new.tenant_id := public.current_tenant_id();
  end if;
  if new.tenant_id is null and tg_table_name <> 'system_logs' then
    raise exception 'tenant_id を特定できません(%)。ログインユーザーのセッションかテナント用クライアントで実行してください', tg_table_name
      using errcode = 'P0001';
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'companies', 'contacts', 'deals', 'emails', 'inquiries', 'deal_notes', 'revenues',
    'mail_sync_state', 'members', 'mail_accounts', 'app_settings', 'email_attachments', 'system_logs'
  ]
  loop
    execute format('drop trigger if exists set_tenant_id on public.%I', t);
    execute format('create trigger set_tenant_id before insert on public.%I for each row execute function public.set_tenant_id()', t);
  end loop;
end $$;

-- ---------- RLS: 自分のテナントの行だけ ----------
-- (select ...) で包むと 1 文につき 1 回だけ評価される(行ごとに関数を呼ばない)
alter table public.tenants enable row level security;
drop policy if exists "tenant_select" on public.tenants;
create policy "tenant_select" on public.tenants
  for select to authenticated using (id = (select public.current_tenant_id()));

do $$
declare t text;
begin
  foreach t in array array[
    'companies', 'contacts', 'deals', 'emails', 'inquiries', 'deal_notes', 'revenues',
    'mail_sync_state', 'members', 'mail_accounts', 'app_settings', 'email_attachments'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "authenticated_all" on public.%I', t);
    execute format('drop policy if exists "tenant_isolation" on public.%I', t);
    execute format(
      'create policy "tenant_isolation" on public.%I for all to authenticated using (tenant_id = (select public.current_tenant_id())) with check (tenant_id = (select public.current_tenant_id()))',
      t
    );
  end loop;
end $$;

-- profiles: 同じテナントのプロフィールを閲覧、更新は自分の行のみ(tenant_id は変更不可)
drop policy if exists "authenticated_all" on public.profiles;
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles
  for select to authenticated using (id = auth.uid() or tenant_id = (select public.current_tenant_id()));
drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self" on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and tenant_id is not distinct from (select public.current_tenant_id()));

-- system_logs: 閲覧・削除は自テナント分、記録はアプリ(ログインユーザー)からも可能にする
drop policy if exists "authenticated_read" on public.system_logs;
drop policy if exists "authenticated_delete" on public.system_logs;
drop policy if exists "tenant_read" on public.system_logs;
create policy "tenant_read" on public.system_logs
  for select to authenticated using (tenant_id = (select public.current_tenant_id()));
drop policy if exists "tenant_delete" on public.system_logs;
create policy "tenant_delete" on public.system_logs
  for delete to authenticated using (tenant_id = (select public.current_tenant_id()));
drop policy if exists "tenant_insert" on public.system_logs;
create policy "tenant_insert" on public.system_logs
  for insert to authenticated with check (tenant_id = (select public.current_tenant_id()));

-- ---------- Storage: <tenant_id>/... のパスだけ扱える ----------
drop policy if exists "email_attachments_read" on storage.objects;
create policy "email_attachments_read" on storage.objects
  for select to authenticated
  using (bucket_id = 'email-attachments' and (storage.foldername(name))[1] = (select public.current_tenant_id())::text);

drop policy if exists "email_attachments_outbox_insert" on storage.objects;
create policy "email_attachments_outbox_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'email-attachments'
    and (storage.foldername(name))[1] = (select public.current_tenant_id())::text
    and (storage.foldername(name))[2] = 'outbox'
  );

drop policy if exists "email_attachments_outbox_delete" on storage.objects;
create policy "email_attachments_outbox_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'email-attachments'
    and (storage.foldername(name))[1] = (select public.current_tenant_id())::text
    and (storage.foldername(name))[2] = 'outbox'
  );

-- ---------- 新規ログインユーザーの所属 ----------
-- 招待時に user_metadata へ member_id / tenant_id を入れる。テナントは
-- 招待された営業担当者(members.tenant_id)→ metadata の tenant_id → 同じメールアドレスの未ログイン営業担当者 の順で決める。
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_name text := coalesce(nullif(new.raw_user_meta_data->>'full_name', ''), split_part(new.email, '@', 1));
  v_member_id uuid := nullif(new.raw_user_meta_data->>'member_id', '')::uuid;
  v_tenant uuid;
  v_linked int := 0;
begin
  if v_member_id is not null then
    select tenant_id into v_tenant from public.members where id = v_member_id and profile_id is null;
  end if;
  if v_tenant is null then
    v_tenant := nullif(new.raw_user_meta_data->>'tenant_id', '')::uuid;
  end if;
  if v_tenant is null then
    select tenant_id into v_tenant from public.members
    where profile_id is null and lower(email) = lower(new.email)
    order by created_at limit 1;
  end if;

  insert into public.profiles (id, email, full_name, tenant_id)
  values (new.id, new.email, v_name, v_tenant)
  on conflict (id) do update set tenant_id = coalesce(public.profiles.tenant_id, excluded.tenant_id);

  -- テナントが決まらないユーザーは営業担当者に結び付けない(ログインしてもデータは見えない)
  if v_tenant is null then
    return new;
  end if;

  if v_member_id is not null then
    update public.members set profile_id = new.id
    where id = v_member_id and tenant_id = v_tenant and profile_id is null;
    get diagnostics v_linked = row_count;
  end if;
  if v_linked = 0 then
    update public.members set profile_id = new.id
    where id = (
      select id from public.members
      where tenant_id = v_tenant and profile_id is null and lower(email) = lower(new.email)
      order by created_at limit 1
    );
    get diagnostics v_linked = row_count;
  end if;
  if v_linked = 0 then
    insert into public.members (id, profile_id, name, email, tenant_id)
    values (new.id, new.id, v_name, new.email, v_tenant)
    on conflict (id) do nothing;
  end if;
  return new;
end $$;

-- ---------- テナントの作成(サーバー内部・スクリプト専用) ----------
-- テナントと最初の営業担当者(招待待ち)を作り、署名や通知先の初期設定を入れる。
create or replace function public.create_tenant(p_name text, p_slug text, p_owner_name text, p_owner_email text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid;
begin
  if p_name is null or btrim(p_name) = '' then raise exception '会社名を指定してください'; end if;
  if p_owner_email is null or position('@' in p_owner_email) = 0 then raise exception '管理者のメールアドレスが正しくありません'; end if;

  insert into public.tenants (name, slug, status, trial_ends_at)
  values (btrim(p_name), lower(btrim(p_slug)), 'trial', now() + interval '90 days')
  returning id into v_tenant;

  insert into public.members (tenant_id, name, email, is_active, sort_order)
  values (v_tenant, coalesce(nullif(btrim(p_owner_name), ''), split_part(p_owner_email, '@', 1)), lower(btrim(p_owner_email)), true, 0);

  insert into public.app_settings (tenant_id, key, value) values
    (v_tenant, 'signature_company', btrim(p_name)),
    (v_tenant, 'signature_email', lower(btrim(p_owner_email))),
    (v_tenant, 'signature_extra', ''),
    (v_tenant, 'reply_subject', 'お問い合わせありがとうございます／' || btrim(p_name)),
    (v_tenant, 'alert_emails', lower(btrim(p_owner_email)));

  return v_tenant;
end $$;
revoke all on function public.create_tenant(text, text, text, text) from public, anon, authenticated;
grant execute on function public.create_tenant(text, text, text, text) to service_role;
