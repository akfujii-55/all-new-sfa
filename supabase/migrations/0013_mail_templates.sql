-- アプリが送る招待メールの文面(全テナント共通)。運営管理から編集する。
-- 行が無い種類はコード内の既定文面(src/lib/mail/templates.ts)を使う。読み書きは service role のみ。
create table if not exists public.mail_templates (
  key text primary key check (key in ('tenant_invite', 'operator_invite', 'member_invite')),
  subject text not null,
  body text not null,
  updated_at timestamptz not null default now()
);
drop trigger if exists mail_templates_updated_at on public.mail_templates;
create trigger mail_templates_updated_at before update on public.mail_templates
  for each row execute function public.set_updated_at();
alter table public.mail_templates enable row level security;
