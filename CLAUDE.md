@AGENTS.md

# SFA アプリ

中小企業向けのシンプルな営業支援ツール(Next.js 16 App Router + Supabase + Tailwind v4 + shadcn/ui)。

## 構成
- `src/app/(app)/*` 認証必須のページ。`src/app/(auth)/login` ログイン。`src/proxy.ts` でセッション更新とリダイレクト。
- `src/actions/*` Server Actions(DB 更新はここに集約)。
- `src/lib/mail/*` Gmail IMAP 取り込み(`sync.ts`)、SMTP 送信(`smtp.ts`)、メールからの情報抽出(`extract.ts`、ANTHROPIC_API_KEY があれば Claude を使用)。
- `supabase/migrations/*.sql` スキーマ。`node scripts/apply-migrations.mjs` で Management API 経由で適用。
- `src/lib/types.ts` DB 行の型とステージ定義。
- 担当者は2種類: `contacts`(顧客側の担当者、メールから自動登録)と `members`(自社の営業担当、`deals.owner_id` の参照先。ログインユーザーは自動で members にも登録)。

## ドメインの流れ
受信メール(顧客/担当者は自動登録) → メール一覧で選択して問い合わせ(inquiries)に登録 → アポ取得で案件化(deals, stage=appointment) → カンバンでステージ管理 → 成約時に月次売上(revenues)を必須入力。

## コマンド
- `npm run dev` / `npm run build` / `npx eslint src` / `npx tsc --noEmit`
