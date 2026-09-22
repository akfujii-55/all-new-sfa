-- ステップメール: お試し中の顧客(テナントの連絡先)へ、テナント作成からの日数に合わせて運営側から自動で送るメール。
-- 運営共通のデータなので tenant_id での分離はせず(mail_templates と同じ)、RLS を有効にしてポリシーを付けない = service role だけが読み書きできる。
-- 送信の判定と実行は src/lib/step-mails.ts。毎朝の同期 cron(/api/mail/sync、7:00 JST)の最後に送る(手動実行は /api/step-mails/run)。

create table if not exists public.step_mails (
  id uuid primary key default gen_random_uuid(),
  -- テナント作成から何日後に送るか(0 = 作成当日)
  day_offset int not null check (day_offset >= 0 and day_offset <= 365),
  -- 運営用の名前(一覧の見出し)
  name text not null check (btrim(name) <> ''),
  subject text not null check (btrim(subject) <> ''),
  body text not null check (btrim(body) <> ''),
  -- true なら課金開始(カード登録)後のテナントにも送る。false なら未課金のテナントだけ
  send_after_paid boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists step_mails_updated_at on public.step_mails;
create trigger step_mails_updated_at before update on public.step_mails
  for each row execute function public.set_updated_at();
alter table public.step_mails enable row level security;

-- 送信の記録。テナント × 回ごとに 1 行(送った / 失敗した / 予定日を過ぎて見送った)
create table if not exists public.step_mail_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  step_id uuid not null references public.step_mails(id) on delete cascade,
  status text not null check (status in ('sent', 'failed', 'skipped')),
  to_email text,
  error text,
  -- 送信予定日(日本時間の日付)
  due_on date not null,
  sent_at timestamptz not null default now(),
  unique (tenant_id, step_id)
);
create index if not exists step_mail_logs_tenant_idx on public.step_mail_logs(tenant_id, sent_at desc);
alter table public.step_mail_logs enable row level security;

-- テナントごとの停止(運営管理のテナント詳細で切り替え)。導入(2026-09-22)より前からあるテナントには送らない
alter table public.tenants add column if not exists step_mails_enabled boolean not null default true;
update public.tenants set step_mails_enabled = false where created_at < '2026-09-22 00:00:00+09';

-- 既定の 6 回(テーブルが空のときだけ投入。文面は運営管理で直す)
insert into public.step_mails (day_offset, name, subject, body, send_after_paid)
select * from (values
  (0, '登録のお礼', '【{{app_name}}】ご登録ありがとうございます',
E'{{company}}\n{{name}} 様\n\n{{app_name}} にご登録いただき、ありがとうございます。\nお試し期間は {{trial_end}} までです。この間、すべての機能を無料でお使いいただけます。\n\nまずはメールアカウントの連携から始めてください。\n連携すると、受信メールから取引先と担当者が自動で登録され、問い合わせ → アポイント → 案件 → 成約までを一本の流れで追えるようになります。\n\nログイン: {{login_link}}\n使い方: {{manual_link}}\n\nご不明な点はこのメールにそのまま返信してください。', true),
  (1, 'メール設定とタグ', '【{{app_name}}】メールの連携はお済みですか?',
E'{{name}} 様\n\n{{app_name}} のご利用 1 日目です。メールアカウントの連携はお済みでしょうか。\nまだの場合は「設定 → メールアカウント」から。Gmail はアプリパスワードで数分で連携できます。\n\n連携できたら、次はタグをお試しください。複数名でメールを確認するときに便利です。\n・営業メールなど不要なメールには「削除リスト」タグ → 一覧から一括削除できます\n・今後連絡するかもしれない相手には「保管」タグ\n・「自動で付けるルール」で、件名・差出人・宛先の条件に合うメールに自動でタグを付けられます\n\nタグはメールだけでなく、自動登録された担当者にも付きます。\nあとから担当者一覧をタグで絞り込んで、まとめてメールを送る相手のリストが作れます。\n\nログイン: {{login_link}}', true),
  (3, '案件化と行動メモ', '【{{app_name}}】案件化はやってみましたか?',
E'{{name}} 様\n\nご利用 3 日目です。問い合わせを「案件化」してみましたか?\n\nメール一覧で対応が必要なメールを選んで「問い合わせに登録」、返信してアポイントが取れたら「案件化」。\nアポイントの日時を入れると、案件の「行動」に Todo が自動で入り、ダッシュボードの「今日やること」に出ます。\n\n商談が終わったら、案件の「行動」に次にやることをどんどんメモしてください。\n期限を付けておけば、期限超過は赤く表示され、サイドバーの「行動」にも件数が出るので、抜け漏れがなくなります。\nカンバンでステージを動かし、成約したら月次の売上を入れるだけです。\n\nログイン: {{login_link}}', true),
  (7, 'カード登録のご案内(1 週間)', '【{{app_name}}】お試し期間はあと {{days_left}} 日です',
E'{{name}} 様\n\n{{app_name}} をお使いいただき 1 週間になりました。お試し期間は {{trial_end}} まで(あと {{days_left}} 日)です。\n\n本番利用を始めていただければ、今の設定・メール・登録した取引先や案件は、そのまま引き続きお使いいただけます。\nお支払い方法の登録は「設定 → お支払い」から、数分で完了します。課金が始まるのはお試し期間が終わってからです。\n\nお支払い設定: {{billing_link}}\n\nご質問があれば、このメールにご返信ください。', false),
  (14, 'カード登録のご案内(2 週間)', '【{{app_name}}】お試し期間はあと {{days_left}} 日です',
E'{{name}} 様\n\nお試し期間の終了({{trial_end}})まで、あと {{days_left}} 日です。\n\nお支払い方法を登録していただければ、お試し期間が終わっても、そのままの設定・メール・登録情報で本番利用に移れます。\nまだご検討中でしたら、気になっている点をこのメールへの返信で教えてください。\n\nお支払い設定: {{billing_link}}', false),
  (21, '最終のご案内', '【{{app_name}}】お試し期間が {{trial_end}} に終了します',
E'{{name}} 様\n\n{{app_name}} のお試し期間が {{trial_end}} に終了します。\n\n期間が終わると、画面は閲覧のみになり、メールの同期と送信が止まります。\nお支払い方法を登録していただければ、そのままの設定・メール・登録情報で引き続きお使いいただけます。\n\nお支払い設定: {{billing_link}}\n\nこれまでお試しいただき、ありがとうございました。', false)
) as v(day_offset, name, subject, body, send_after_paid)
where not exists (select 1 from public.step_mails);
