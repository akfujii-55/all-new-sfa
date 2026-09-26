-- 契約状態に「無償利用(complimentary)」を追加する。
-- 決済なしで本番を継続して使えるテナント(自社や特別契約の会社)。運営管理画面からだけ設定できる。
-- お試し期限の判定・Stripe の Webhook による上書き・ステップメールの対象から外れ、定期同期・ヘルスチェックの対象には入る。
alter table public.tenants drop constraint if exists tenants_status_check;
alter table public.tenants add constraint tenants_status_check
  check (status in ('trial', 'active', 'suspended', 'cancelled', 'complimentary'));
