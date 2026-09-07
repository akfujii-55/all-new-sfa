-- ---------- 営業担当者の招待 ----------
alter table public.members add column if not exists invited_at timestamptz;

-- 新規ユーザー登録時: 同じメールアドレスの営業担当者が既にいればそれに結び付け、無ければ新規作成
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_name text := coalesce(nullif(new.raw_user_meta_data->>'full_name', ''), split_part(new.email, '@', 1));
  v_member_id uuid := nullif(new.raw_user_meta_data->>'member_id', '')::uuid;
  v_linked int := 0;
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, v_name)
  on conflict (id) do nothing;

  -- 招待時に指定された営業担当者、または同じメールアドレスの未ログイン営業担当者に結び付ける
  if v_member_id is not null then
    update public.members set profile_id = new.id
    where id = v_member_id and profile_id is null;
    get diagnostics v_linked = row_count;
  end if;
  if v_linked = 0 then
    update public.members set profile_id = new.id
    where id = (
      select id from public.members
      where profile_id is null and lower(email) = lower(new.email)
      order by created_at limit 1
    );
    get diagnostics v_linked = row_count;
  end if;
  if v_linked = 0 then
    insert into public.members (id, profile_id, name, email)
    values (new.id, new.id, v_name, new.email)
    on conflict (id) do nothing;
  end if;
  return new;
end $$;

-- ---------- メールアカウント(複数の Gmail などを受信・送信に使う) ----------
create table if not exists public.mail_accounts (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  email text not null unique,
  from_name text,
  imap_host text not null default 'imap.gmail.com',
  imap_port int not null default 993,
  smtp_host text not null default 'smtp.gmail.com',
  smtp_port int not null default 465,
  -- アプリパスワードをサーバー側の鍵で暗号化したもの(src/lib/mail/crypto.ts)
  password_enc text not null,
  is_active boolean not null default true,
  is_default boolean not null default false,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists mail_accounts_updated_at on public.mail_accounts;
create trigger mail_accounts_updated_at before update on public.mail_accounts
  for each row execute function public.set_updated_at();

alter table public.mail_accounts enable row level security;
drop policy if exists "authenticated_all" on public.mail_accounts;
create policy "authenticated_all" on public.mail_accounts for all to authenticated using (true) with check (true);

-- メールがどのアカウントで受信/送信されたか
alter table public.emails add column if not exists account_id uuid references public.mail_accounts(id) on delete set null;
create index if not exists emails_account_idx on public.emails(account_id);

-- 同期位置をアカウントごとに持つ(mailbox 単独の主キー → id 主キー + (account_id, mailbox) 一意)
alter table public.mail_sync_state drop constraint if exists mail_sync_state_pkey;
alter table public.mail_sync_state add column if not exists id uuid not null default gen_random_uuid();
alter table public.mail_sync_state add primary key (id);
alter table public.mail_sync_state add column if not exists account_id uuid references public.mail_accounts(id) on delete cascade;
create unique index if not exists mail_sync_state_account_mailbox_idx on public.mail_sync_state(account_id, mailbox);
