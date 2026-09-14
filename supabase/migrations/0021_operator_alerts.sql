-- 運営側のエラー通知先を operator_settings に持つ。
-- これまでシステム全体のエラーは運営側テナントの app_settings.alert_emails に送っていたので、その値を初期値として写す。
insert into public.operator_settings (key, value)
select 'alert_emails', coalesce((
  select s.value from public.app_settings s
  where s.key = 'alert_emails'
    and s.tenant_id = (select t.id from public.tenants t order by t.created_at limit 1)
  limit 1
), '')
on conflict (key) do nothing;

insert into public.operator_settings (key, value) values
  ('alert_lark_webhook', ''),  -- Lark グループチャットのカスタム Bot Webhook URL
  ('alert_lark_secret', '')    -- Lark Bot の署名シークレット(任意)
on conflict (key) do nothing;
