-- システムログ: サーバー側で起きたエラー・警告・定期処理の結果を後から確認できるように残す。
-- 書き込みはサーバー内部(service role)から行い、ログイン済みユーザーは閲覧と削除のみ。
create table if not exists public.system_logs (
  id uuid primary key default gen_random_uuid(),
  level text not null check (level in ('info', 'warn', 'error')),
  -- 発生箇所の識別子(例: mail.send / mail.sync / cron.sync / health / action / render / client)
  source text not null,
  message text not null,
  -- スタックトレースや宛先など補足情報
  detail jsonb,
  request_path text,
  user_email text,
  -- 通知(メール/Webhook)を送ったか
  notified boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists system_logs_created_at_idx on public.system_logs (created_at desc);
create index if not exists system_logs_source_notified_idx on public.system_logs (source, created_at desc) where notified;

alter table public.system_logs enable row level security;
drop policy if exists "authenticated_read" on public.system_logs;
create policy "authenticated_read" on public.system_logs for select to authenticated using (true);
drop policy if exists "authenticated_delete" on public.system_logs;
create policy "authenticated_delete" on public.system_logs for delete to authenticated using (true);

-- 通知先メールアドレス(カンマ区切り)。空なら通知しない
insert into public.app_settings (key, value) values ('alert_emails', 'akfujii@art-trading.co.jp')
on conflict (key) do nothing;
