-- メールのゴミ箱: 削除は物理削除ではなく deleted_at を入れる(スレッド単位)。
-- ゴミ箱の中身は RLS の select で隠すので、emails を読む既存のコードは何も変えずに削除済みが見えなくなる。
-- ゴミ箱画面だけがビュー email_trash を読み、移動・復元・完全削除は security definer の関数で行う
-- (update/delete の where 句と RETURNING にも select ポリシーが掛かるため、通常のクエリでは削除済みの行を作れず・触れない)。
-- 14 日を過ぎたものは cron(/api/mail/sync)が email_trash_purge で消す(添付の実体はアプリ側が先に消す)。

alter table public.emails add column if not exists deleted_at timestamptz;
alter table public.emails add column if not exists deleted_by uuid references public.profiles(id) on delete set null;
create index if not exists emails_tenant_deleted_idx on public.emails(tenant_id, deleted_at) where deleted_at is not null;

-- RLS: select は削除済みを除く。insert / update / delete は従来どおりテナントだけで絞る
drop policy if exists "tenant_isolation" on public.emails;
drop policy if exists "tenant_select_live" on public.emails;
drop policy if exists "tenant_insert" on public.emails;
drop policy if exists "tenant_update" on public.emails;
drop policy if exists "tenant_delete" on public.emails;
create policy "tenant_select_live" on public.emails for select to authenticated
  using (tenant_id = (select public.current_tenant_id()) and deleted_at is null);
create policy "tenant_insert" on public.emails for insert to authenticated
  with check (tenant_id = (select public.current_tenant_id()));
create policy "tenant_update" on public.emails for update to authenticated
  using (tenant_id = (select public.current_tenant_id()))
  with check (tenant_id = (select public.current_tenant_id()));
create policy "tenant_delete" on public.emails for delete to authenticated
  using (tenant_id = (select public.current_tenant_id()));

-- ゴミ箱の一覧(自テナントの削除済みメールだけ)。ビューは所有者権限で読むので、テナントの絞り込みをビュー自身が行う
create or replace view public.email_trash with (security_barrier) as
select
  e.id, e.thread_key, e.direction, e.from_address, e.from_name, e.to_addresses, e.subject, e.snippet, e.received_at,
  e.company_id, e.deal_id, e.inquiry_id, e.deleted_at, e.deleted_by,
  p.full_name as deleted_by_name
from public.emails e
left join public.profiles p on p.id = e.deleted_by
where e.deleted_at is not null and e.tenant_id = (select public.current_tenant_id());
revoke all on public.email_trash from public, anon;
grant select on public.email_trash to authenticated, service_role;

-- ゴミ箱へ移動: スレッド単位で deleted_at / deleted_by を入れる。移動したメールの件数を返す
-- (通常の update は RETURNING の行が select ポリシーに掛かり「new row violates row-level security policy」になるため関数で行う)
create or replace function public.email_trash_move(p_thread_keys text[])
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_count integer;
begin
  if v_tenant is null then raise exception 'tenant is required'; end if;
  update public.emails set deleted_at = now(), deleted_by = auth.uid()
    where tenant_id = v_tenant and deleted_at is null and thread_key = any(p_thread_keys);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
grant execute on function public.email_trash_move(text[]) to authenticated, service_role;

-- 復元: スレッド単位で deleted_at を外す。戻したメールの件数を返す
create or replace function public.email_trash_restore(p_thread_keys text[])
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_count integer;
begin
  if v_tenant is null then raise exception 'tenant is required'; end if;
  update public.emails set deleted_at = null, deleted_by = null
    where tenant_id = v_tenant and deleted_at is not null and thread_key = any(p_thread_keys);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
grant execute on function public.email_trash_restore(text[]) to authenticated, service_role;

-- 完全削除: ゴミ箱にあるメールだけを id 指定で物理削除する(添付の行は cascade。実体は呼び出し側が先に消す)。消した件数を返す
create or replace function public.email_trash_purge(p_ids uuid[])
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_count integer;
begin
  if v_tenant is null then raise exception 'tenant is required'; end if;
  delete from public.emails where tenant_id = v_tenant and deleted_at is not null and id = any(p_ids);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
grant execute on function public.email_trash_purge(uuid[]) to authenticated, service_role;
