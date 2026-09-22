-- メールアカウントごとの署名(任意)。空なら設定画面の共通の署名(メールアドレスの行は送信元アカウントのアドレス)。
-- {{自社担当者}} {{自社メール}} の差し込みを使える。組み立ては src/lib/mail/signature.ts
alter table public.mail_accounts add column if not exists signature text;
