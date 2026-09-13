import Link from "next/link";
import { CheckCircle2, XCircle, Mail, Plus, Pencil, ScrollText, CreditCard } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenant } from "@/lib/supabase/tenant";
import { getMyUsage } from "@/lib/tenant-quota";
import { fmtGb } from "@/lib/pricing";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MailSyncButton } from "@/components/inbox/mail-sync-button";
import { MailAccountDialog } from "@/components/settings/mail-account-dialog";
import { MailAccountActions } from "@/components/settings/mail-account-actions";
import { MailSettingsForm } from "@/components/settings/mail-settings-form";
import { AlertSettingsForm } from "@/components/settings/alert-settings-form";
import { FormSettingsForm } from "@/components/settings/form-settings-form";
import { TagSettings } from "@/components/settings/tag-settings";
import { getAlertSettings, getFormSettings, getMailSettings } from "@/lib/settings";
import { fmtDateTime } from "@/lib/format";
import { TENANT_STATUS_LABEL, type MailAccount, type Tag } from "@/lib/types";
import { PROVIDER_LABEL, providerOf } from "@/lib/mail/providers";

export const metadata = { title: "設定" };

type AccountRow = Omit<MailAccount, "password_enc">;

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const [tenant, usage, { data: tagRows }, { data: accountRows }, { data: states }, mailSettings, { data: member }, alertSettings, { count: errorCount, error: logsError }, { data: lastCron }, formSettings] = await Promise.all([
    getCurrentTenant(supabase),
    getMyUsage(supabase).catch(() => null),
    supabase.from("tags").select("*").order("sort_order").order("created_at"),
    supabase
      .from("mail_accounts")
      .select("id, label, email, from_name, imap_host, imap_port, smtp_host, smtp_port, login_user, is_active, is_default, last_error, created_at, updated_at")
      .order("is_default", { ascending: false })
      .order("created_at"),
    supabase.from("mail_sync_state").select("*"),
    getMailSettings(supabase),
    supabase.from("members").select("name").eq("profile_id", auth.user?.id ?? "").maybeSingle(),
    getAlertSettings(supabase),
    supabase.from("system_logs").select("id", { count: "exact", head: true }).eq("level", "error").gte("created_at", hoursAgo(24)),
    supabase.from("system_logs").select("message, created_at, level").like("source", "cron.%").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    getFormSettings(supabase),
  ]);
  const webhookConfigured = Boolean(process.env.ALERT_WEBHOOK_URL);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "");
  const accounts = (accountRows ?? []) as AccountRow[];
  const aiConfigured = Boolean(process.env.ANTHROPIC_API_KEY);
  const cronConfigured = Boolean(process.env.CRON_SECRET);

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="設定"
        description="メールアカウント連携、署名、通知の設定"
        actions={<MailAccountDialog trigger={<Button size="sm"><Plus className="size-4" /> メールアカウントを追加</Button>} />}
      />

      <div className="space-y-4">
        {tenant && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">会社(テナント)</CardTitle>
              <CardDescription>この会社のデータは他の利用企業からは見えません。会社 ID はサポートへの問い合わせ時に使います。</CardDescription>
            </CardHeader>
            <CardContent className="text-sm space-y-1">
              <p><span className="text-muted-foreground">会社名:</span> {tenant.name}</p>
              <p><span className="text-muted-foreground">会社 ID:</span> <code className="rounded bg-muted px-1">{tenant.slug}</code></p>
              <p>
                <span className="text-muted-foreground">契約状態:</span> {TENANT_STATUS_LABEL[tenant.status]}
                {tenant.status === "trial" && tenant.trial_ends_at && <span className="text-muted-foreground">(お試し期間は {fmtDateTime(tenant.trial_ends_at)} まで)</span>}
              </p>
              {usage && (
                <p className="pt-1 text-xs text-muted-foreground">
                  ご利用状況: ログインユーザー {usage.users} / {tenant.max_users} 名(招待中を含む) · 連携メールアカウント {usage.mail_accounts} / {tenant.max_mail_accounts} 件 · 使用容量 {fmtGb(usage.storage_bytes)} / {fmtGb(tenant.max_storage_bytes)} · メール {usage.emails.toLocaleString("ja-JP")} 件。
                  上限の変更は運営までお問い合わせください。
                </p>
              )}
              <div className="pt-2">
                <Button asChild size="sm" variant="outline"><Link href="/settings/billing"><CreditCard className="size-4" /> ご契約・お支払い</Link></Button>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">メールアカウント連携</CardTitle>
            <CardDescription>
              営業で使うメールアカウントを連携すると、受信トレイと送信済みメールを取り込み、このアプリから返信・送信できます(返信は受信したアカウントから送られます)。
              Gmail / Google Workspace のほか、IMAP と SMTP が使えるメールサーバー(レンタルサーバーのメールなど)を連携できます。設定手順はこのページの下にあります。
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm">
            {accounts.length === 0 ? (
              <div className="rounded-lg border border-dashed p-6 text-center text-muted-foreground">
                <Mail className="mx-auto mb-2 size-6" />
                まだメールアカウントが連携されていません。右上の「メールアカウントを追加」から連携してください。
              </div>
            ) : (
              <div className="divide-y">
                {accounts.map((a) => {
                  const own = (states ?? []).filter((s) => s.account_id === a.id);
                  return (
                    <div key={a.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{a.label}</span>
                          {a.label !== a.email && <span className="text-muted-foreground">{a.email}</span>}
                          {a.is_default && <Badge>既定の差出人</Badge>}
                          {!a.is_active && <Badge variant="outline">無効</Badge>}
                        </div>
                        {a.from_name && <p className="text-xs text-muted-foreground">差出人名: {a.from_name}</p>}
                        <p className="text-xs text-muted-foreground">
                          {PROVIDER_LABEL[providerOf(a)]}
                          {providerOf(a) === "other" && ` · IMAP ${a.imap_host}:${a.imap_port} / SMTP ${a.smtp_host}:${a.smtp_port}`}
                          {a.login_user && ` · ログイン ID ${a.login_user}`}
                        </p>
                        {a.last_error ? (
                          <p className="mt-1 flex items-center gap-1 text-xs text-destructive"><XCircle className="size-3" /> {a.last_error}</p>
                        ) : own.length > 0 ? (
                          <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                            <CheckCircle2 className="size-3 text-emerald-500" />
                            最終同期 {fmtDateTime(own.map((s) => s.last_synced_at).filter(Boolean).sort().at(-1) ?? null)}
                            {own.some((s) => s.last_error) && <span className="text-destructive"> · {own.find((s) => s.last_error)?.last_error}</span>}
                          </p>
                        ) : (
                          <p className="mt-1 text-xs text-muted-foreground">まだ同期されていません</p>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <MailAccountActions id={a.id} isDefault={a.is_default} />
                        <MailAccountDialog account={a} trigger={<Button size="sm" variant="ghost"><Pencil className="size-4" /></Button>} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="pt-3"><MailSyncButton label="今すぐ同期" /></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">問い合わせフォームの通知メール</CardTitle>
            <CardDescription>
              自社サイトの問い合わせフォームから届く通知メールは、差出人(フォームツール)ではなく本文に書かれた問い合わせ者を担当者として登録します。
              本文の「項目名: 値」の行を読み取るので、通知メールを下の推奨フォーマットに合わせると確実です。合わせられない場合は、自社フォームの項目名をここに登録してください。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5 text-sm">
            <FormSettingsForm settings={formSettings} />
            <div className="space-y-2">
              <p className="font-medium">推奨フォーマット(通知メールの本文)</p>
              <pre className="overflow-x-auto rounded-md border bg-muted/40 p-3 text-xs leading-relaxed">{`会社名: 株式会社サンプル
お名前: 山田 太郎
メールアドレス: taro@example.co.jp
電話番号: 03-1234-5678
お問い合わせ内容:
在庫管理の効率化について相談したい。
来週デモをお願いできますか。`}</pre>
              <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                <li>1 行に 1 項目、「項目名: 値」の形にします(コロンは半角・全角どちらでも可)。問い合わせ内容は複数行でも構いません。</li>
                <li>メールアドレスの行は必須です。この行が無いと通常のメールとして扱い、差出人が担当者として登録されます。</li>
                <li>HTML メールでも読み取れますが、表組みではなくテキストの行にするほうが確実です。</li>
                <li>Google フォーム、formrun、HubSpot、WordPress(Contact Form 7 など)の通知メールは、テンプレートの本文をこの形に編集できます。</li>
                <li>通知メールの差出人アドレスを上の「送信元アドレス」に登録しておくと、読み取れなかった場合でもフォームツールのアドレスが担当者として登録されるのを防げます。</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">タグ</CardTitle>
            <CardDescription>メールと担当者に付ける属性(リード、顧客、要注意など)。名前と色を変えたり、追加・削除ができます。</CardDescription>
          </CardHeader>
          <CardContent>
            <TagSettings tags={(tagRows ?? []) as Tag[]} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">メール署名・返信件名</CardTitle>
            <CardDescription>返信や新規作成の本文に入る署名と、返信メールの件名の初期値です。担当者名は営業担当者ページの名前が使われます。</CardDescription>
          </CardHeader>
          <CardContent>
            <MailSettingsForm settings={mailSettings} memberName={member?.name ?? "(担当者名)"} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">エラー記録と通知</CardTitle>
            <CardDescription>メールの送受信の失敗やページのエラーはシステムログに残り、通知先へメールで知らせます。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            {logsError ? (
              <p className="flex items-center gap-1 text-destructive"><XCircle className="size-4" /> ログ表がありません。supabase/migrations/0006_system_logs.sql を適用してください。</p>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
                <div className="space-y-1">
                  <p className="flex items-center gap-2">
                    {(errorCount ?? 0) > 0 ? <XCircle className="size-4 text-destructive" /> : <CheckCircle2 className="size-4 text-emerald-500" />}
                    直近 24 時間のエラー: {errorCount ?? 0} 件
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {lastCron ? `最後の定期処理: ${fmtDateTime(lastCron.created_at)} ${lastCron.message}` : "定期処理はまだ記録されていません"}
                  </p>
                </div>
                <Button asChild size="sm" variant="outline"><Link href="/settings/logs"><ScrollText className="size-4" /> システムログを見る</Link></Button>
              </div>
            )}
            <AlertSettingsForm settings={alertSettings} webhookConfigured={webhookConfigured} />
            <p className="text-xs text-muted-foreground">
              アプリ自体が停止したとき(Vercel や Supabase の障害)はアプリからは通知できません。
              UptimeRobot などの外形監視で <code className="rounded bg-muted px-1">{appUrl || "https://<アプリのURL>"}/api/health</code> を 5 分おきに確認する設定にすると、停止時に監視サービスから通知が届きます。
              ログイン中にこの URL を開くと IMAP / SMTP の接続確認も行います(毎朝 8 時にも自動で確認)。
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">その他の連携</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Status ok={aiConfigured} label={aiConfigured ? "Claude によるメール情報抽出: 有効" : "Claude によるメール情報抽出: 無効(ルールベースで抽出)"} />
            <Status ok={cronConfigured} label={cronConfigured ? "定期同期用 CRON_SECRET: 設定済み" : "定期同期用 CRON_SECRET: 未設定"} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">メールアカウント連携の設定手順</CardTitle>
            <CardDescription>Gmail は Google のアプリパスワードで、その他のメールサーバーは IMAP / SMTP の設定で連携します。</CardDescription>
          </CardHeader>
          <CardContent className="text-sm space-y-4">
            <h3 className="font-medium">Gmail / Google Workspace の場合</h3>
            <ol className="list-decimal pl-5 space-y-2">
              <li>連携する Gmail アカウントで 2 段階認証(2 段階認証プロセス)を有効にします。アプリパスワードは 2 段階認証が有効なアカウントでのみ発行できます。</li>
              <li>
                <a className="underline" href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer">https://myaccount.google.com/apppasswords</a>
                {" "}に、連携する Gmail アカウントでログインします。アプリ名(例: SFA)を入力して「作成」を押すと、16 桁のアプリパスワードが表示されます。この画面を閉じると再表示できないので控えてください。
              </li>
              <li>Gmail の設定 → 「メール転送と POP/IMAP」で IMAP が有効になっていることを確認します。</li>
              <li>右上の「メールアカウントを追加」で「Gmail / Google Workspace」を選び、メールアドレスと発行したアプリパスワードを入力して保存し、「接続テスト」で確認します。パスワードは暗号化して保存されます。</li>
              <li>「今すぐ同期」を押すと、そのアカウントの直近 30 日分のメールを取り込みます。以後は毎日自動で同期されます。</li>
            </ol>
            <p className="text-muted-foreground">
              Google Workspace のアカウントでは、管理者が IMAP とアプリパスワードの利用を許可している必要があります。
              アプリパスワードは Google アカウントの「セキュリティ」からいつでも取り消せます。取り消した場合はこの画面で新しいパスワードに更新してください。
            </p>
            <h3 className="font-medium pt-2">その他のメールサーバー(レンタルサーバー、プロバイダーのメールなど)の場合</h3>
            <ol className="list-decimal pl-5 space-y-2">
              <li>ご利用のメールサービスの管理画面やマニュアルで、「メールソフトの設定」に記載されている IMAP サーバー名・SMTP サーバー名・ポート番号・ログイン ID を確認します。IMAP が無効になっている場合は有効にします。</li>
              <li>右上の「メールアカウントを追加」で「その他の IMAP / SMTP サーバー」を選び、メールアドレス、パスワード、サーバー名とポートを入力します。ログイン ID がメールアドレスと違う場合だけ「ログイン ID」に入力します。</li>
              <li>保存後に「接続テスト」で IMAP と SMTP の両方にログインできることを確認します。失敗した場合はエラーの内容に沿ってサーバー名・ポート・ログイン ID を見直してください。</li>
            </ol>
            <p className="text-muted-foreground">
              接続は SSL(IMAP 993 / SMTP 465)または STARTTLS(IMAP 143 / SMTP 587)で暗号化します。暗号化に対応していないサーバーには接続できません。
              Microsoft 365 / Outlook.com は IMAP のパスワード認証が廃止されているため、現在は連携できません(今後、メール転送による取り込みで対応予定です)。
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/** 現在時刻から h 時間前の ISO 文字列 */
function hoursAgo(h: number) {
  return new Date(Date.now() - h * 60 * 60 * 1000).toISOString();
}

function Status({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2">
      {ok ? <CheckCircle2 className="size-4 text-emerald-500" /> : <XCircle className="size-4 text-muted-foreground" />}
      <span>{label}</span>
    </div>
  );
}
