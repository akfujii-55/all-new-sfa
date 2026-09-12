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
- タグ(0014): `tags`(テナントごと、設定画面で最大 20 個、既定 6 個はテナント作成時にトリガーで投入)、`email_tags` / `contact_tags`。メール一覧の選択からタグ付けするとスレッド内の全メールと紐付く担当者にも付く(`src/actions/tags.ts`)。担当者一覧はタグで絞り込み、`/api/contacts/export` で CSV。埋め込みは `tags:email_tags(tag:tags(...))`、絞り込みは `filter_tags:email_tags!inner(tag_id)` + `.eq("filter_tags.tag_id", id)`。
- マルチテナント(0009 以降): 契約企業は `tenants`、所属は `profiles.tenant_id`。業務テーブルは全部 `tenant_id` 列 + RLS(`tenant_isolation`)で分離し、insert 時は DB トリガーが `current_tenant_id()` で補う。
  - ログインユーザーのクライアント(`createClient`)なら既存コードのまま自テナントに絞られる。cron などユーザーが居ない処理は `src/lib/supabase/tenant.ts` の `createTenantClient(tenantId)`(要 `SUPABASE_JWT_SECRET`)でテナントごとに回す。
  - `createAdminClient`(service role)は RLS を通らないので業務テーブルの読み書きに使わない(使うのは auth.admin、Storage の実体操作、tenants 一覧、tenant_id が null のシステムログのみ)。service role で tenant_id 無しに insert すると例外になる。
  - 新しいテーブルを足すときは `tenant_id uuid not null references tenants(id) on delete cascade` + `set_tenant_id` トリガー + `tenant_isolation` ポリシーを必ず付ける。一意制約は `(tenant_id, ...)` の複合にする。
  - Storage(email-attachments)のパスは `<tenant_id>/...`。テナント作成は運営管理画面 `/admin/tenants/new`(または `node scripts/create-tenant.mjs`)。どちらも DB 関数 `create_tenant`。
- 運営管理(0010 以降): `/admin`(`src/app/(admin)`)は `operators` に登録された auth ユーザーのみ(`is_operator()`)。運営者は `operators.is_super` のスーパーユーザー(akfujii@art-trading.co.jp)が /admin/users からメールで招待する。招待された運営者は運営専用アカウント(user_metadata operator=true → `handle_new_user` がテナントに所属させない。profiles.tenant_id は null)で、テナント側の画面にはログインできず、削除で auth ユーザーごと消える。テナント利用者と同じメールは運営者にできない。
- 招待メールの文面は `src/lib/mail/templates.ts`(既定文面 + `mail_templates` テーブルの上書き、`{{name}}` などの差し込み)。運営管理 /admin/mail-templates で編集。新しい送信メールを足すときは同じ仕組みを使う。`src/actions/admin.ts` が service role でテナント横断に tenants / operator_settings / members(招待)を扱う。料金・既定上限は `operator_settings`、月額計算は `src/lib/pricing.ts`。
  - 上限(ユーザー数=profiles+招待中、メールアカウント数、容量=添付+本文バイト)と利用可否(停止・解約・お試し期限切れは閲覧のみ)は `src/lib/tenant-quota.ts`。書き込み系 Server Action の入口で `assertTenantWritable` / `assertCanAddUser` / `assertCanAddMailAccount` / `assertStorageAvailable` を呼ぶ。

## ドメインの流れ
受信メール(顧客/担当者は自動登録) → メール一覧で選択して問い合わせ(inquiries)に登録 → アポ取得で案件化(deals, stage=appointment) → カンバンでステージ管理 → 成約時に月次売上(revenues)を必須入力。

## コマンド
- `npm run dev` / `npm run build` / `npx eslint src` / `npx tsc --noEmit`
