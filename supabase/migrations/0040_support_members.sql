-- 運営者が 1 つのログインで複数のテナントに入れるようにする(運営サポート)
--
-- - 運営管理のユーザー管理で、運営者ごとに「入れるテナント」を決める。入れるテナントには、その運営者の
--   営業担当者(members)の行を is_support = true・profile_id = 運営者 で作る。所属(profiles.tenant_id)は変えない。
-- - アプリは選択中のテナントをリクエストヘッダー x-sfa-tenant で送る。current_tenant_id() は
--   「JWT の tenant_id クレーム(サーバー内部)」→「ヘッダーのテナント(自分の営業担当者の行があるときだけ)」
--   →「profiles.tenant_id(所属)」→「所属が無い運営専用アカウントは最初に入れるテナント」の順に解決する。
--   RLS はこれまでどおり current_tenant_id() の 1 テナントだけを見せるので、テナントのデータは混ざらない。
-- - 運営サポートは profiles.tenant_id がそのテナントではないので、ユーザー数の上限・課金の数量(tenant_usage_of)には数えない。
--   テナント側で営業担当者を「無効」にすれば、そのテナントには入れなくなる。
-- - operators.support_only = true は「運営サポート専用」: 入れるテナントの画面だけを使い、運営管理(/admin)には入れない。
--   is_operator() は運営管理に入れる運営者だけを true にする。
-- 再適用可。

alter table public.operators add column if not exists support_only boolean not null default false;
comment on column public.operators.support_only is '運営サポート専用(入れるテナントの画面だけ。運営管理には入れない)';

create or replace function public.is_operator()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.operators where user_id = auth.uid() and not support_only);
$$;
grant execute on function public.is_operator() to authenticated, service_role;

alter table public.members add column if not exists is_support boolean not null default false;
comment on column public.members.is_support is '運営管理から付けた運営サポート(運営者が自分のログインでこのテナントに入る)。ユーザー数に数えない';
create index if not exists members_profile_idx on public.members(profile_id) where profile_id is not null;

-- リクエストヘッダー x-sfa-tenant のテナント ID(形が uuid でなければ null)
create or replace function public.requested_tenant_id()
returns uuid
language plpgsql stable set search_path = public as $$
declare
  v text;
begin
  v := nullif(current_setting('request.headers', true), '')::json ->> 'x-sfa-tenant';
  if v ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return v::uuid;
  end if;
  return null;
exception when others then
  return null;
end $$;
grant execute on function public.requested_tenant_id() to anon, authenticated, service_role;

create or replace function public.current_tenant_id()
returns uuid
language sql stable security definer set search_path = public as $$
  select coalesce(
    nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'tenant_id', '')::uuid,
    (select m.tenant_id from public.members m
      where m.profile_id = auth.uid() and m.is_active and m.tenant_id = public.requested_tenant_id()
      limit 1),
    (select p.tenant_id from public.profiles p where p.id = auth.uid()),
    (select m.tenant_id from public.members m
      where m.profile_id = auth.uid() and m.is_active
      order by m.created_at limit 1)
  );
$$;
grant execute on function public.current_tenant_id() to anon, authenticated, service_role;

-- ログインユーザーの所属テナント(選択中のテナントに関係なく profiles.tenant_id)
create or replace function public.my_home_tenant_id()
returns uuid
language sql stable security definer set search_path = public as $$
  select p.tenant_id from public.profiles p where p.id = auth.uid();
$$;
grant execute on function public.my_home_tenant_id() to authenticated;

-- ログインユーザーが入れるテナントの一覧(所属 + 営業担当者の行があるテナント)。テナントの切り替え用
create or replace function public.my_tenants()
returns table (id uuid, name text, is_home boolean, is_current boolean)
language sql stable security definer set search_path = public as $$
  select t.id, t.name,
    coalesce(t.id = public.my_home_tenant_id(), false),
    coalesce(t.id = public.current_tenant_id(), false)
  from public.tenants t
  where auth.uid() is not null
    and (
      t.id = public.my_home_tenant_id()
      or exists (select 1 from public.members m where m.tenant_id = t.id and m.profile_id = auth.uid() and m.is_active)
    )
  order by coalesce(t.id = public.my_home_tenant_id(), false) desc, t.created_at;
$$;
revoke all on function public.my_tenants() from public, anon;
grant execute on function public.my_tenants() to authenticated;

-- profiles: 選択中のテナントの利用者に加えて、そのテナントに入っている運営サポートのプロフィールも見える。
-- 更新は自分の行のみで、所属(tenant_id)は変えられない(選択中のテナントではなく元の所属と比べる)
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles
  for select to authenticated using (
    id = auth.uid()
    or tenant_id = (select public.current_tenant_id())
    or exists (select 1 from public.members m where m.profile_id = profiles.id and m.tenant_id = (select public.current_tenant_id()))
  );
drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self" on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and tenant_id is not distinct from (select public.my_home_tenant_id()));

-- Storage(email-attachments): Storage API のリクエストには x-sfa-tenant が届かないことがあるので、
-- 選択中のテナントではなく「入れるテナント」のフォルダかどうかで判定する
drop policy if exists "email_attachments_read" on storage.objects;
create policy "email_attachments_read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'email-attachments'
    and exists (select 1 from public.my_tenants() t where t.id::text = (storage.foldername(name))[1])
  );

drop policy if exists "email_attachments_outbox_insert" on storage.objects;
create policy "email_attachments_outbox_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'email-attachments'
    and exists (select 1 from public.my_tenants() t where t.id::text = (storage.foldername(name))[1])
    and (storage.foldername(name))[2] = 'outbox'
  );

drop policy if exists "email_attachments_outbox_delete" on storage.objects;
create policy "email_attachments_outbox_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'email-attachments'
    and exists (select 1 from public.my_tenants() t where t.id::text = (storage.foldername(name))[1])
    and (storage.foldername(name))[2] = 'outbox'
  );
