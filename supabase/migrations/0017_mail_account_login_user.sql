-- Gmail 以外のメールサーバー対応: ログイン ID がメールアドレスと異なるサーバー(一部のプロバイダー)のために
-- 認証用のユーザー名を別に持てるようにする。null ならメールアドレスでログインする。
alter table public.mail_accounts add column if not exists login_user text;
