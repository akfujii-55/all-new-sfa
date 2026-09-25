-- 行動(Todo)の担当者。自社の営業担当者(members)を割り当て、ダッシュボード・行動一覧で表示・絞り込みできるようにする。
-- 案件の担当者(deals.owner_id)とは別で、行動ごとに「誰がやるか」を持つ。担当者を削除しても行動は残す(null に戻す)。
alter table public.deal_activities
  add column if not exists owner_id uuid references public.members(id) on delete set null;
create index if not exists deal_activities_owner_idx on public.deal_activities(tenant_id, owner_id) where done_at is null;

-- 既存の未完了の行動は、その案件の担当者を行動の担当者として引き継ぐ(完了済みの履歴は触らない)
update public.deal_activities a
set owner_id = d.owner_id
from public.deals d
where a.deal_id = d.id
  and a.owner_id is null
  and a.done_at is null
  and d.owner_id is not null;
