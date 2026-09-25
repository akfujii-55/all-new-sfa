-- 新着メールのチャット通知(0033): 同期で新しい受信メールを取り込んだとき、Lark / Slack / Chatwork / 汎用 Webhook に知らせる。
-- テナントごとに最大 5 件(設定画面「新着メールの通知」)。通知先ごとに対象のメールアカウントとまとめ方を選べる。
create table if not exists public.mail_notifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  -- 送り先の種類: lark=Lark カスタム Bot / slack=Incoming Webhook / chatwork=Chatwork API / webhook=Slack 互換の {text} を受ける URL
  kind text not null check (kind in ('lark', 'slack', 'chatwork', 'webhook')),
  -- 一覧に表示する名前(例: 営業チーム)
  name text not null check (btrim(name) <> '' and char_length(name) <= 50),
  -- Webhook URL(lark / slack / webhook)。chatwork では空
  url text not null default '',
  -- Lark の署名シークレット / Chatwork の API トークン(mail_accounts.password_enc と同じ方式で暗号化)
  secret_enc text,
  -- Chatwork のルーム ID
  room_id text,
  -- 対象のメールアカウント。null なら全アカウント。アカウントを消したら通知先も消す
  mail_account_id uuid references public.mail_accounts(id) on delete cascade,
  -- 送り方: digest=同期ごとにまとめて 1 件 / each=メール 1 通につき 1 件
  mode text not null default 'digest' check (mode in ('digest', 'each')),
  is_active boolean not null default true,
  last_sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists mail_notifications_tenant_idx on public.mail_notifications(tenant_id, created_at);

drop trigger if exists mail_notifications_updated_at on public.mail_notifications;
create trigger mail_notifications_updated_at before update on public.mail_notifications
  for each row execute function public.set_updated_at();
drop trigger if exists set_tenant_id on public.mail_notifications;
create trigger set_tenant_id before insert on public.mail_notifications
  for each row execute function public.set_tenant_id();
alter table public.mail_notifications enable row level security;
drop policy if exists "tenant_isolation" on public.mail_notifications;
create policy "tenant_isolation" on public.mail_notifications for all to authenticated
  using (tenant_id = (select public.current_tenant_id()))
  with check (tenant_id = (select public.current_tenant_id()));
