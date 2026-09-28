-- 0035: ゴミ箱のメールの内容を確認できるようにする
-- ゴミ箱画面 /inbox/trash/[id] がスレッドの本文・CC・担当者を読めるよう、ビュー email_trash に列を足す。
-- (view の列は途中に足せないので drop → create。security_barrier と権限も付け直す。再適用可)

drop view if exists public.email_trash;
create view public.email_trash with (security_barrier) as
select
  e.id, e.thread_key, e.direction, e.from_address, e.from_name, e.to_addresses, e.subject, e.snippet, e.received_at,
  e.company_id, e.deal_id, e.inquiry_id, e.deleted_at, e.deleted_by,
  p.full_name as deleted_by_name,
  e.cc_addresses, e.text_body, e.contact_id, e.account_id
from public.emails e
left join public.profiles p on p.id = e.deleted_by
where e.deleted_at is not null and e.tenant_id = (select public.current_tenant_id());
revoke all on public.email_trash from public, anon;
grant select on public.email_trash to authenticated, service_role;
