@AGENTS.md

# SFA アプリ

中小企業向けのシンプルな営業支援ツール(Next.js 16 App Router + Supabase + Tailwind v4 + shadcn/ui)。

## 構成
- `src/app/(app)/*` 認証必須のページ。`src/app/(auth)/login` ログイン。`src/proxy.ts` でセッション更新とリダイレクト。
- `src/actions/*` Server Actions(DB 更新はここに集約)。
- `src/lib/mail/*` メールアカウント(`accounts.ts`、複数可。パスワードは `crypto.ts` で暗号化して `mail_accounts` に保存)、IMAP 取り込み(`sync.ts`)、SMTP 送信(`smtp.ts`)、メールからの情報抽出(`extract.ts`、ANTHROPIC_API_KEY があれば Claude を使用)、担当者・取引先の紐付け(`link.ts`、自社サイトのフォーム通知は本文の問い合わせ者を使う)。
- エラー記録と通知: `src/lib/log.ts`(`logSystem` で `system_logs` に記録。error は設定画面の通知先メールと `ALERT_WEBHOOK_URL` へ通知、同じ source は 30 分に 1 回)。`src/instrumentation.ts` の `onRequestError` でサーバー側の未捕捉エラーを自動記録。`/api/health` は外形監視用(認証なしは DB のみ、cron/ログイン時は IMAP/SMTP も確認)。ログは `/settings/logs`。
- `supabase/migrations/*.sql` スキーマ。`node scripts/apply-migrations.mjs` で Management API 経由で適用。
- `src/lib/types.ts` DB 行の型とステージ定義。
- 担当者は2種類: `contacts`(取引先側の担当者、メールから自動登録)と `members`(自社の営業担当者、`deals.owner_id` の参照先)。ログインは招待制: 営業担当者ページの「招待」で `auth.admin.generateLink` のリンクを自アプリの SMTP で送り、`/auth/confirm` → `/set-password` でパスワードを設定する。自己登録は無効。
- UI の用語: 取引先=companies、担当者=contacts、営業担当者=members。

## ドメインの流れ
受信メール(顧客/担当者は自動登録) → メール一覧で選択して問い合わせ(inquiries)に登録 → アポ取得で案件化(deals, stage=appointment) → カンバンでステージ管理 → 成約時に月次売上(revenues)を必須入力。

## コマンド
- `npm run dev` / `npm run build` / `npx eslint src` / `npx tsc --noEmit`
