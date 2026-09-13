-- 案件の「行動」(電話・メール・訪問・見積書作成・折り返し依頼などの履歴と Todo)。
-- 期限(due_at)を持ち、未完了(done_at が null)で期限を過ぎたものは画面で期限超過として警告する。
create table if not exists public.deal_activities (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  deal_id uuid not null references public.deals(id) on delete cascade,
  -- 種類: call=電話, email=メール, visit=訪問, quote=見積書作成, callback=電話折り返し依頼, other=その他
  kind text not null check (kind in ('call', 'email', 'visit', 'quote', 'callback', 'other')),
  body text not null,
  due_at timestamptz,
  done_at timestamptz,
  author_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists deal_activities_deal_idx on public.deal_activities(deal_id, created_at desc);
create index if not exists deal_activities_due_idx on public.deal_activities(tenant_id, due_at) where done_at is null;

drop trigger if exists deal_activities_updated_at on public.deal_activities;
create trigger deal_activities_updated_at before update on public.deal_activities
  for each row execute function public.set_updated_at();
drop trigger if exists set_tenant_id on public.deal_activities;
create trigger set_tenant_id before insert on public.deal_activities
  for each row execute function public.set_tenant_id();
alter table public.deal_activities enable row level security;
drop policy if exists "tenant_isolation" on public.deal_activities;
create policy "tenant_isolation" on public.deal_activities for all to authenticated
  using (tenant_id = (select public.current_tenant_id()))
  with check (tenant_id = (select public.current_tenant_id()));
