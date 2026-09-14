-- 行動の種類に「アポイント」を既定で追加する。案件作成時にアポイント日時が入っていると、この種類の行動(Todo)を自動で作る。
create or replace function public.seed_default_activity_kinds(p_tenant uuid)
returns void language sql security definer set search_path = public as $$
  insert into public.activity_kinds (tenant_id, name, icon, sort_order) values
    (p_tenant, 'アポイント', 'calendar', 0),
    (p_tenant, '電話', 'call', 1),
    (p_tenant, 'メール', 'email', 2),
    (p_tenant, '訪問', 'visit', 3),
    (p_tenant, '見積書作成', 'quote', 4),
    (p_tenant, '電話折り返し依頼', 'callback', 5),
    (p_tenant, 'その他', 'other', 6)
  on conflict (tenant_id, name) do nothing;
$$;
revoke all on function public.seed_default_activity_kinds(uuid) from public, anon, authenticated;

-- 既存テナントにも「アポイント」を入れる(既に同名があれば何もしない)
select public.seed_default_activity_kinds(id) from public.tenants;
