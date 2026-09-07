-- 社内の営業担当(自社側の担当者)。顧客側の担当者(contacts)とは別管理。
create table if not exists public.members (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete set null,
  name text not null,
  email text,
  is_active boolean not null default true,
  sort_order int not null default 0,
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists members_updated_at on public.members;
create trigger members_updated_at before update on public.members
  for each row execute function public.set_updated_at();

-- 既存のログインユーザーを営業担当として登録(id を profiles と揃え、既存 deals.owner_id を維持する)
insert into public.members (id, profile_id, name, email)
select id, id, coalesce(nullif(full_name, ''), split_part(coalesce(email, ''), '@', 1), '担当者'), email
from public.profiles
on conflict (id) do nothing;

-- deals.owner_id の参照先を profiles → members に切り替え
alter table public.deals drop constraint if exists deals_owner_id_fkey;
alter table public.deals
  add constraint deals_owner_id_fkey foreign key (owner_id) references public.members(id) on delete set null;
create index if not exists deals_owner_idx on public.deals(owner_id);

-- 新規ユーザー登録時に members にも自動追加
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  insert into public.members (id, profile_id, name, email)
  values (new.id, new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)), new.email)
  on conflict (id) do nothing;
  return new;
end $$;

-- RLS(他テーブルと同じくログインユーザーは全アクセス可)
alter table public.members enable row level security;
drop policy if exists "authenticated_all" on public.members;
create policy "authenticated_all" on public.members for all to authenticated using (true) with check (true);
