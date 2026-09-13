-- フォーム通知メールの読み取り設定(app_settings のキー追加、スキーマ変更なし)。
-- これまでコードに直書きしていた自社サイト(アートトレーディング)のフォーム固有のラベルを、運営側テナントの設定に移す。
insert into public.app_settings (tenant_id, key, value)
select t.id, 'form_labels_message', '現状の課題やご相談内容があれば教えてください'
from public.tenants t
where t.slug = 'art-trading'
on conflict (tenant_id, key) do update set value = excluded.value where public.app_settings.value = '';
