-- 問い合わせから行動(Todo)を作れるようにする。
-- これまで行動は案件にだけ紐付いていた(deal_id 必須)。問い合わせに直接付けられるよう inquiry_id を足し、deal_id を任意にする。
-- どちらか一方は必ず入る。問い合わせを案件化したときは、その問い合わせの行動に deal_id も入れて案件の「行動」タブに引き継ぐ。
-- 問い合わせを削除すると、その問い合わせだけに付いた行動は一緒に消える(案件にも付いている行動は、削除の前にアプリ側で inquiry_id を外して案件に残す)。
alter table public.deal_activities alter column deal_id drop not null;
alter table public.deal_activities add column if not exists inquiry_id uuid;
alter table public.deal_activities drop constraint if exists deal_activities_inquiry_id_fkey;
alter table public.deal_activities add constraint deal_activities_inquiry_id_fkey
  foreign key (inquiry_id) references public.inquiries(id) on delete cascade;
alter table public.deal_activities drop constraint if exists deal_activities_target_check;
alter table public.deal_activities add constraint deal_activities_target_check
  check (deal_id is not null or inquiry_id is not null);
create index if not exists deal_activities_inquiry_idx on public.deal_activities(inquiry_id, created_at desc) where inquiry_id is not null;

-- PostgREST に新しい外部キー(inquiries → deal_activities の埋め込み)を読み込ませる
notify pgrst, 'reload schema';
