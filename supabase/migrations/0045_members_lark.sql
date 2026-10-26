-- 営業担当者の Lark ユーザー ID(0045)。
-- 行動(Todo)のチャット通知(Lark)で担当者を @ で呼ぶのに使う。ou_ で始まる open_id か、Lark 管理コンソールのメンバー詳細にあるユーザー ID。
-- 空なら今までどおり名前だけを出す。Slack / Chatwork / Webhook には使わない。
alter table public.members add column if not exists lark_user_id text;
