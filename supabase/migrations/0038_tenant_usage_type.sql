-- テナントの利用タイプ。
-- sfa  = 営業支援(従来どおり。案件・行動・売上を使う)
-- mail = メール管理(複数のメールアカウントと問い合わせの管理だけに使う。案件・行動・売上の画面とダッシュボードの売上を出さない)
-- 運営管理のテナント詳細からだけ切り替える。データは消さず表示だけを切り替えるので、後から sfa に戻せば元の案件・売上がそのまま見える。
alter table public.tenants add column if not exists usage_type text not null default 'sfa';
alter table public.tenants drop constraint if exists tenants_usage_type_check;
alter table public.tenants add constraint tenants_usage_type_check check (usage_type in ('sfa', 'mail'));
