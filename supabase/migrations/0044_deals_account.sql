-- 案件のメールアカウント(0044)。
-- 案件がどのメールアカウント(事業・ブランド)のものかを deals.account_id に持つ。
-- 問い合わせ・メールから案件化したときはそのメールのアカウントを入れ、メール起点のない案件は作成ダイアログで選ぶ(アカウントが 2 つ以上のとき必須)。
-- 行動(Todo)のチャット通知の振り分け(通知先の「○○ のみ」)はまずこの列で決める。アカウントを削除したら null に戻す(案件は残す)。
alter table public.deals
  add column if not exists account_id uuid references public.mail_accounts(id) on delete set null;
create index if not exists deals_account_id_idx on public.deals(account_id);

-- 既存の案件: 紐付くメール → 元の問い合わせのメールの順で、いちばん新しいメールのアカウントを入れる(決まらないものは null のまま)
update public.deals d
set account_id = sub.account_id
from (
  select distinct on (x.deal_id) x.deal_id, x.account_id
  from (
    select e.deal_id, e.account_id, e.received_at
    from public.emails e
    where e.deal_id is not null and e.account_id is not null and e.deleted_at is null
    union all
    select dd.id as deal_id, e.account_id, e.received_at
    from public.deals dd
    join public.emails e on e.inquiry_id = dd.inquiry_id
    where dd.inquiry_id is not null and e.account_id is not null and e.deleted_at is null
  ) x
  order by x.deal_id, x.received_at desc
) sub
where d.id = sub.deal_id and d.account_id is null;
