-- メールの自動タグ付けルールに判定場所「宛先」を追加。
-- to=宛先(To と CC のメールアドレス)。特定のアドレス宛てに届いたメール全部にタグを付けるために使う。
alter table public.email_tag_rules drop constraint if exists email_tag_rules_field_check;
alter table public.email_tag_rules add constraint email_tag_rules_field_check check (field in ('subject', 'from', 'to'));
