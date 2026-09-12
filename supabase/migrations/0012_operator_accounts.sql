-- 運営者は運営専用アカウントにする(どのテナントにも所属せず、テナント側の画面にはログインできない)
--
-- - 招待時の user_metadata に operator = 'true' が入っていれば、handle_new_user はテナントの解決や
--   営業担当者(members)への結び付けを行わず、所属なし(profiles.tenant_id = null)のプロフィールだけを作る。
-- - 以前の方式で運営側テナントの営業担当者として登録された運営者(スーパーユーザー以外)は、
--   営業担当者の登録を消し、所属を外す。

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_name text := coalesce(nullif(new.raw_user_meta_data->>'full_name', ''), split_part(new.email, '@', 1));
  v_member_id uuid := nullif(new.raw_user_meta_data->>'member_id', '')::uuid;
  v_operator boolean := coalesce(new.raw_user_meta_data->>'operator', '') = 'true';
  v_tenant uuid;
  v_linked int := 0;
begin
  -- 運営専用アカウント: テナントに所属させない
  if v_operator then
    insert into public.profiles (id, email, full_name, tenant_id)
    values (new.id, new.email, v_name, null)
    on conflict (id) do nothing;
    return new;
  end if;

  if v_member_id is not null then
    select tenant_id into v_tenant from public.members where id = v_member_id and profile_id is null;
  end if;
  if v_tenant is null then
    v_tenant := nullif(new.raw_user_meta_data->>'tenant_id', '')::uuid;
  end if;
  if v_tenant is null then
    select tenant_id into v_tenant from public.members
    where profile_id is null and lower(email) = lower(new.email)
    order by created_at limit 1;
  end if;

  insert into public.profiles (id, email, full_name, tenant_id)
  values (new.id, new.email, v_name, v_tenant)
  on conflict (id) do update set tenant_id = coalesce(public.profiles.tenant_id, excluded.tenant_id);

  if v_tenant is null then
    return new;
  end if;

  if v_member_id is not null then
    update public.members set profile_id = new.id
    where id = v_member_id and tenant_id = v_tenant and profile_id is null;
    get diagnostics v_linked = row_count;
  end if;
  if v_linked = 0 then
    update public.members set profile_id = new.id
    where id = (
      select id from public.members
      where tenant_id = v_tenant and profile_id is null and lower(email) = lower(new.email)
      order by created_at limit 1
    );
    get diagnostics v_linked = row_count;
  end if;
  if v_linked = 0 then
    insert into public.members (id, profile_id, name, email, tenant_id)
    values (new.id, new.id, v_name, new.email, v_tenant)
    on conflict (id) do nothing;
  end if;
  return new;
end $$;

-- 以前の方式で営業担当者として登録された運営者(スーパーユーザー以外)を運営専用に戻す
delete from public.members
where sort_order = 99
  and profile_id in (select user_id from public.operators where not is_super);

update public.profiles
set tenant_id = null
where id in (select user_id from public.operators where not is_super)
  and not exists (select 1 from public.members m where m.profile_id = profiles.id);
