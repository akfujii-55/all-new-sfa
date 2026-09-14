-- メールテンプレート: 返信・新規作成で選ぶ文面(設定画面で管理)。
-- member_id が null なら会社共通、入っていればその営業担当者だけの「自分専用」。件名・本文に {{取引先}} などの差し込み項目を書ける(src/lib/mail/merge.ts)。
create table if not exists public.email_templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  member_id uuid references public.members(id) on delete cascade,
  name text not null check (btrim(name) <> '' and char_length(name) <= 50),
  subject text not null default '' check (char_length(subject) <= 200),
  body text not null check (char_length(body) <= 5000),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists email_templates_tenant_idx on public.email_templates(tenant_id, member_id, sort_order);

drop trigger if exists email_templates_updated_at on public.email_templates;
create trigger email_templates_updated_at before update on public.email_templates
  for each row execute function public.set_updated_at();
drop trigger if exists set_tenant_id on public.email_templates;
create trigger set_tenant_id before insert on public.email_templates
  for each row execute function public.set_tenant_id();
alter table public.email_templates enable row level security;
drop policy if exists "tenant_isolation" on public.email_templates;
create policy "tenant_isolation" on public.email_templates for all to authenticated
  using (tenant_id = (select public.current_tenant_id()))
  with check (tenant_id = (select public.current_tenant_id()));
