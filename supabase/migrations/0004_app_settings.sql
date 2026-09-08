-- アプリ全体の設定(キー・値)。メール署名や返信の件名など、設定画面から変更する値を持つ。
create table if not exists public.app_settings (
  key text primary key,
  value text not null default '',
  updated_at timestamptz not null default now()
);
drop trigger if exists app_settings_updated_at on public.app_settings;
create trigger app_settings_updated_at before update on public.app_settings
  for each row execute function public.set_updated_at();

alter table public.app_settings enable row level security;
drop policy if exists "authenticated_all" on public.app_settings;
create policy "authenticated_all" on public.app_settings for all to authenticated using (true) with check (true);

-- 初期値(既に値があれば変更しない)
insert into public.app_settings (key, value) values
  ('signature_company', 'アートトレーディング株式会社'),
  ('signature_email', 'support@art-trading.co.jp'),
  ('signature_extra', ''),
  ('reply_subject', 'お問い合わせありがとうございます／アートトレーディング')
on conflict (key) do nothing;
