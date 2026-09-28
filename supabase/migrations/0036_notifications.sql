-- 0036: 担当者への通知(お知らせ)
-- 問い合わせ・案件・行動の担当者に付けられたとき、その営業担当者(ログインユーザー)にアプリ内で知らせる。
-- ヘッダーの通知ベルとダッシュボードの「あなたへのお知らせ」に表示し、既読にすると消える。
-- 通知は本人だけが読める(テナント分離に加えて recipient_id = auth.uid() で絞る)。再適用可。
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  -- 受け取る人(ログインユーザー)。members.profile_id から引く
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  -- 起こした人(担当者を付けた人)。本人が自分に付けたときは通知しない
  actor_id uuid references public.profiles(id) on delete set null,
  -- 種類: inquiry_assigned=問い合わせの担当者 / deal_assigned=案件の担当者 / activity_assigned=行動の担当者
  kind text not null check (kind in ('inquiry_assigned', 'deal_assigned', 'activity_assigned')),
  title text not null,
  body text,
  -- 開く先(アプリ内のパス)
  href text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_recipient_idx on public.notifications(recipient_id, created_at desc);
create index if not exists notifications_unread_idx on public.notifications(recipient_id) where read_at is null;

drop trigger if exists set_tenant_id on public.notifications;
create trigger set_tenant_id before insert on public.notifications
  for each row execute function public.set_tenant_id();
alter table public.notifications enable row level security;
-- 読む・既読にする・消すのは本人だけ。作るのは同じテナントの利用者なら誰でも(担当者を付けた人が相手あてに作る)
drop policy if exists "tenant_isolation" on public.notifications;
drop policy if exists "notifications_own" on public.notifications;
create policy "notifications_own" on public.notifications for select to authenticated
  using (tenant_id = (select public.current_tenant_id()) and recipient_id = (select auth.uid()));
drop policy if exists "notifications_own_update" on public.notifications;
create policy "notifications_own_update" on public.notifications for update to authenticated
  using (tenant_id = (select public.current_tenant_id()) and recipient_id = (select auth.uid()))
  with check (tenant_id = (select public.current_tenant_id()) and recipient_id = (select auth.uid()));
drop policy if exists "notifications_own_delete" on public.notifications;
create policy "notifications_own_delete" on public.notifications for delete to authenticated
  using (tenant_id = (select public.current_tenant_id()) and recipient_id = (select auth.uid()));
drop policy if exists "notifications_insert" on public.notifications;
create policy "notifications_insert" on public.notifications for insert to authenticated
  with check (tenant_id = (select public.current_tenant_id()));

-- ログイン前の営業担当者にはメールで知らせるので、メールテンプレートのキー member_assigned を許可する
alter table public.mail_templates drop constraint if exists mail_templates_key_check;
alter table public.mail_templates
  add constraint mail_templates_key_check
  check (key in ('tenant_invite', 'operator_invite', 'member_invite', 'signup_confirm', 'password_reset', 'member_assigned'));
