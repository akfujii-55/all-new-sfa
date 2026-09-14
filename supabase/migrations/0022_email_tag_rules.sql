-- メールの自動タグ付けルール: 件名または差出人にキーワードを含むメールに、同期時にタグを付ける(設定画面のタグの下で管理)。
create table if not exists public.email_tag_rules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  -- 判定する場所: subject=件名、from=差出人(名前とアドレス)
  field text not null check (field in ('subject', 'from')),
  -- キーワード。「、」「,」改行で区切ると、いずれか 1 つを含めば一致
  keywords text not null check (btrim(keywords) <> '' and char_length(keywords) <= 500),
  tag_id uuid not null references public.tags(id) on delete cascade,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists email_tag_rules_tenant_idx on public.email_tag_rules(tenant_id, sort_order);

drop trigger if exists email_tag_rules_updated_at on public.email_tag_rules;
create trigger email_tag_rules_updated_at before update on public.email_tag_rules
  for each row execute function public.set_updated_at();
drop trigger if exists set_tenant_id on public.email_tag_rules;
create trigger set_tenant_id before insert on public.email_tag_rules
  for each row execute function public.set_tenant_id();
alter table public.email_tag_rules enable row level security;
drop policy if exists "tenant_isolation" on public.email_tag_rules;
create policy "tenant_isolation" on public.email_tag_rules for all to authenticated
  using (tenant_id = (select public.current_tenant_id()))
  with check (tenant_id = (select public.current_tenant_id()));
