-- メール同期の連続失敗回数。メールサーバーの一時的な不調(接続直後の切断・応答なし)で毎回通知しないよう、
-- 同期に成功したら 0 に戻し、続けて失敗した回数が一定数に達したときだけエラーとして通知する(src/lib/mail/sync.ts)。
alter table public.mail_accounts add column if not exists sync_failures integer not null default 0;
