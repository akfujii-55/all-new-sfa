# SFA アプリ

Gmail の問い合わせメールを起点に、顧客・担当者・問い合わせ・案件(カンバン)・商談メモ・月次売上をひとつの流れで管理する、中小企業向けのシンプルな SFA です。

## 技術スタック

- Next.js 16(App Router, Server Actions, Proxy)
- Supabase(Postgres / Auth / RLS)
- Tailwind CSS v4 + shadcn/ui
- Gmail IMAP(imapflow + mailparser)/ SMTP(nodemailer)
- 任意: Claude API によるメール情報抽出

## 機能

| 機能 | 内容 |
| --- | --- |
| メール受信 | Gmail の受信トレイ・送信済みを IMAP で取り込み。送信者からドメインや署名を解析して顧客・担当者を自動登録 |
| 問い合わせ管理 | メール一覧で対応が必要なメールを選択して問い合わせに登録。要約・分類・ステータス管理 |
| メール送信 | Gmail SMTP で送信。返信はスレッドを維持し、案件・顧客の履歴に残る |
| 案件 | アポ取得時に問い合わせから案件化。カンバン(リード / アポ取得 / 提案 / 交渉 / 成約 / 失注)。営業担当ごとに切り替え可能 |
| 営業担当 | 自社の営業担当を登録し、案件の担当として設定。ログインユーザーは自動登録 |
| 商談メモ | 案件ごとの時系列メモ |
| 売上計上 | 成約時に計上月と金額(複数月分割可)を必須入力。月次売上ダッシュボード |

## セットアップ

1. 依存関係をインストール

   ```bash
   npm install
   ```

2. `.env.example` を `.env.local` にコピーし、値を設定

   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
   - `GMAIL_USER`, `GMAIL_APP_PASSWORD`(Google アカウントで 2 段階認証を有効にしてアプリパスワードを発行。Gmail 設定で IMAP を有効化)
   - `CRON_SECRET`(定期同期用)
   - 任意: `ANTHROPIC_API_KEY`(メールからの会社名・担当者・要約の抽出精度が上がります)

3. Supabase にスキーマを適用

   ```bash
   SUPABASE_ACCESS_TOKEN=sbp_xxx SUPABASE_PROJECT_REF=xxxx node scripts/apply-migrations.mjs
   ```

   Supabase ダッシュボードの SQL Editor に `supabase/migrations/0001_init.sql` を貼り付けて実行しても構いません。

4. 起動

   ```bash
   npm run dev
   ```

   http://localhost:3000/login でアカウントを作成してログインします(Supabase Auth の「Confirm email」を無効にすると即ログインできます)。

## メール同期

- 画面右上の「メール同期」で手動同期。
- 定期同期は `GET /api/mail/sync` を `Authorization: Bearer <CRON_SECRET>` 付きで呼び出します。Vercel では `vercel.json` の cron 設定で 5 分ごとに実行されます。
- Gmail 以外のメールを扱う場合は、そのアドレスから Gmail へ自動転送してください。
