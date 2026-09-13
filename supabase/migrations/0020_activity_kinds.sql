-- 案件の行動の「種類」をテナントごとに設定できるようにする(タグと同じく設定画面で追加・編集・並び替え)。
-- これまでの固定の 6 種類(call/email/visit/quote/callback/other)は既定の種類として各テナントに投入し、
-- 既存の deal_activities.kind をアイコンのキー経由で kind_id に写してから kind 列を落とす。

create table if not exists public.activity_kinds (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null check (btrim(name) <> '' and char_length(name) <= 30),
  -- アイコンのキー(src/lib/activity-kinds.ts の ACTIVITY_ICONS)
  icon text not null default 'other',
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create unique index if not exists activity_kinds_tenant_name_key on public.activity_kinds(tenant_id, name);
create index if not exists activity_kinds_tenant_idx on public.activity_kinds(tenant_id, sort_order);

drop trigger if exists set_tenant_id on public.activity_kinds;
create trigger set_tenant_id before insert on public.activity_kinds
  for each row execute function public.set_tenant_id();
alter table public.activity_kinds enable row level security;
drop policy if exists "tenant_isolation" on public.activity_kinds;
create policy "tenant_isolation" on public.activity_kinds for all to authenticated
  using (tenant_id = (select public.current_tenant_id()))
  with check (tenant_id = (select public.current_tenant_id()));

-- 既定の種類。テナント作成時に自動で入れる(既存テナントにも入れる)
create or replace function public.seed_default_activity_kinds(p_tenant uuid)
returns void language sql security definer set search_path = public as $$
  insert into public.activity_kinds (tenant_id, name, icon, sort_order) values
    (p_tenant, '電話', 'call', 0),
    (p_tenant, 'メール', 'email', 1),
    (p_tenant, '訪問', 'visit', 2),
    (p_tenant, '見積書作成', 'quote', 3),
    (p_tenant, '電話折り返し依頼', 'callback', 4),
    (p_tenant, 'その他', 'other', 5)
  on conflict (tenant_id, name) do nothing;
$$;
revoke all on function public.seed_default_activity_kinds(uuid) from public, anon, authenticated;

create or replace function public.on_tenant_created_seed_activity_kinds()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.seed_default_activity_kinds(new.id);
  return new;
end $$;
drop trigger if exists tenants_seed_activity_kinds on public.tenants;
create trigger tenants_seed_activity_kinds after insert on public.tenants
  for each row execute function public.on_tenant_created_seed_activity_kinds();

select public.seed_default_activity_kinds(id) from public.tenants;

-- deal_activities: kind(固定キー)→ kind_id(activity_kinds への参照)。使用中の種類は削除できない(restrict)
alter table public.deal_activities add column if not exists kind_id uuid references public.activity_kinds(id) on delete restrict;
create index if not exists deal_activities_kind_idx on public.deal_activities(kind_id);

do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'deal_activities' and column_name = 'kind') then
    -- 既定の種類はアイコンのキーが旧 kind と同じなので、それで対応付ける
    update public.deal_activities a
      set kind_id = k.id
      from public.activity_kinds k
      where k.tenant_id = a.tenant_id and k.icon = a.kind and a.kind_id is null;
    -- 万一対応付かなかった行は「その他」に寄せる
    update public.deal_activities a
      set kind_id = k.id
      from public.activity_kinds k
      where k.tenant_id = a.tenant_id and k.icon = 'other' and a.kind_id is null;
    alter table public.deal_activities drop column kind;
  end if;
end $$;

alter table public.deal_activities alter column kind_id set not null;
