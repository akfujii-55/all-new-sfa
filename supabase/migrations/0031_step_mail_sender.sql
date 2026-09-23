-- ステップメールの送信元(運営管理 → ステップメールの「送信元」で設定)。
--   step_mail_account_id : 送信に使う運営側テナントのメールアカウント id(空なら既定のアカウント)
--   step_mail_from_email : 差出人アドレスの上書き(空ならアカウントのアドレス)。SMTP はアカウントのものを使うので、
--                          そのアカウントで送信できるエイリアス(Gmail の「他のアドレスから送信」など)を入れる
--   step_mail_from_name  : 差出人名の上書き(空ならアカウントの差出人名)
insert into public.operator_settings (key, value) values
  ('step_mail_account_id', ''),
  ('step_mail_from_email', ''),
  ('step_mail_from_name', '')
on conflict (key) do nothing;
