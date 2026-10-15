-- 行動(Todo)の登録をチャットに通知する(0042): 設定画面「新着メールの通知」の通知先ごとに、新着メールに加えて
-- 行動(Todo)を新しく登録したときも同じ Lark / Slack / Chatwork / Webhook に知らせるかを選べるようにする。
-- 既存の通知先は既定で通知しない(利用者が設定画面で「行動(Todo)の登録も通知する」をオンにする)。
alter table public.mail_notifications
  add column if not exists notify_todo boolean not null default false;
