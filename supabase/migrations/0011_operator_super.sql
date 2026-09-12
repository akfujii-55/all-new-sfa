-- 運営者のスーパーユーザー。運営者の招待・削除はスーパーユーザーだけが行える。
alter table public.operators add column if not exists is_super boolean not null default false;
alter table public.operators add column if not exists name text;

update public.operators set is_super = true
where user_id = (select id from auth.users where email = 'akfujii@art-trading.co.jp');
