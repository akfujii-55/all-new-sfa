-- タグ: メールと担当者(contacts)に付ける属性(リード・セールス・パートナー・顧客・失注・要注意など)。
-- テナントごとに設定画面で増減できる。担当者メニューではタグで絞り込んで送信リストを作る。

create table if not exists public.tags (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null check (btrim(name) <> '' and char_length(name) <= 30),
  -- 表示色のキー(src/lib/tags.ts の TAG_COLORS)
  color text not null default 'gray',
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create unique index if not exists tags_tenant_name_key on public.tags(tenant_id, name);
create index if not exists tags_tenant_idx on public.tags(tenant_id, sort_order);

create table if not exists public.email_tags (
  email_id uuid not null references public.emails(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (email_id, tag_id)
);
create index if not exists email_tags_tag_idx on public.email_tags(tag_id);
create index if not exists email_tags_tenant_idx on public.email_tags(tenant_id);

create table if not exists public.contact_tags (
  contact_id uuid not null references public.contacts(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (contact_id, tag_id)
);
create index if not exists contact_tags_tag_idx on public.contact_tags(tag_id);
create index if not exists contact_tags_tenant_idx on public.contact_tags(tenant_id);

-- tenant_id の自動補完と RLS(他テーブルと同じ)
do $$
declare t text;
begin
  foreach t in array array['tags', 'email_tags', 'contact_tags']
  loop
    execute format('drop trigger if exists set_tenant_id on public.%I', t);
    execute format('create trigger set_tenant_id before insert on public.%I for each row execute function public.set_tenant_id()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "tenant_isolation" on public.%I', t);
    execute format(
      'create policy "tenant_isolation" on public.%I for all to authenticated using (tenant_id = (select public.current_tenant_id())) with check (tenant_id = (select public.current_tenant_id()))',
      t
    );
  end loop;
end $$;

-- 既定のタグ。テナント作成時に自動で入れる(既存テナントにも入れる)
create or replace function public.seed_default_tags(p_tenant uuid)
returns void language sql security definer set search_path = public as $$
  insert into public.tags (tenant_id, name, color, sort_order) values
    (p_tenant, 'リード', 'sky', 0),
    (p_tenant, 'セールス', 'violet', 1),
    (p_tenant, 'パートナー', 'teal', 2),
    (p_tenant, '顧客', 'green', 3),
    (p_tenant, '失注', 'gray', 4),
    (p_tenant, '要注意', 'red', 5)
  on conflict (tenant_id, name) do nothing;
$$;
revoke all on function public.seed_default_tags(uuid) from public, anon, authenticated;

create or replace function public.on_tenant_created_seed_tags()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.seed_default_tags(new.id);
  return new;
end $$;
drop trigger if exists tenants_seed_tags on public.tenants;
create trigger tenants_seed_tags after insert on public.tenants
  for each row execute function public.on_tenant_created_seed_tags();

select public.seed_default_tags(id) from public.tenants;
