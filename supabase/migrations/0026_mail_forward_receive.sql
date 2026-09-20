-- メール転送による受信: IMAP で連携できないメールサービス(Microsoft 365 など)向け。
-- 利用者は自分のメールサーバーで「受け口アドレス」への自動転送を設定し、運営側の受信用メールボックスに届いたものを
-- 宛先のトークンでテナントのアカウントに振り分けて取り込む(src/lib/mail/inbound.ts)。送信は従来どおり SMTP。
alter table public.mail_accounts add column if not exists receive_mode text not null default 'imap'
  check (receive_mode in ('imap', 'forward'));
-- 受け口アドレスのトークン(推測できないランダム文字列)。受信用メールボックスは全テナント共通なので全体で一意にする
alter table public.mail_accounts add column if not exists inbound_token text;
create unique index if not exists mail_accounts_inbound_token_key on public.mail_accounts(inbound_token) where inbound_token is not null;
