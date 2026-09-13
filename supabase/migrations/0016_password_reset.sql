-- パスワード再設定メールをアプリから送るためのテンプレートキーを追加。
-- 併せて 0015 で追加した signup_confirm もキーの制約に含める(0013 の制約のままだと保存時に check 違反になっていた)。
alter table public.mail_templates drop constraint if exists mail_templates_key_check;
alter table public.mail_templates
  add constraint mail_templates_key_check
  check (key in ('tenant_invite', 'operator_invite', 'member_invite', 'signup_confirm', 'password_reset'));
