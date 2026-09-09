import Link from "next/link";
import { CheckCircle2, XCircle, Mail, Plus, Pencil, ScrollText } from "lucide-react";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { bootstrapEnvAccount } from "@/lib/mail/accounts";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MailSyncButton } from "@/components/inbox/mail-sync-button";
import { MailAccountDialog } from "@/components/settings/mail-account-dialog";
import { MailAccountActions } from "@/components/settings/mail-account-actions";
import { MailSettingsForm } from "@/components/settings/mail-settings-form";
import { AlertSettingsForm } from "@/components/settings/alert-settings-form";
import { getAlertSettings, getMailSettings } from "@/lib/settings";
import { fmtDateTime } from "@/lib/format";
import type { MailAccount } from "@/lib/types";

export const metadata = { title: "設定" };

type AccountRow = Omit<MailAccount, "password_enc">;

export default async function SettingsPage() {
  // 環境変数で設定していた旧アカウントがあれば、初回だけアカウント表へ取り込む
  await bootstrapEnvAccount(createAdminClient());

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const [{ data: accountRows }, { data: states }, mailSettings, { data: member }, alertSettings, { count: errorCount, error: logsError }, { data: lastCron }] = await Promise.all([
    supabase
      .from("mail_accounts")
      .select("id, label, email, from_name, imap_host, imap_port, smtp_host, smtp_port, is_active, is_default, last_error, created_at, updated_at")
      .order("is_default", { ascending: false })
      .order("created_at"),
    supabase.from("mail_sync_state").select("*"),
    getMailSettings(supabase),
    supabase.from("members").select("name").eq("profile_id", auth.user?.id ?? "").maybeSingle(),
    getAlertSettings(supabase),
    supabase.from("system_logs").select("id", { count: "exact", head: true }).eq("level", "error").gte("created_at", hoursAgo(24)),
    supabase.from("system_logs").select("message, created_at, level").like("source", "cron.%").order("created_at", { ascending: false }).limit(1).maybeSingle(),
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
        description="メールアカウント、署名、連携の状態"
        actions={<MailAccountDialog trigger={<Button size="sm"><Plus className="size-4" /> メールアカウントを追加</Button>} />}
      />

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">メールアカウント</CardTitle>
            <CardDescription>登録した各アカウントの受信トレイ・送信済みを IMAP で取り込み、SMTP で送信します。返信は受信したアカウントから送られます。</CardDescription>
          </CardHeader>
          <CardContent className="text-sm">
            {accounts.length === 0 ? (
              <div className="rounded-lg border border-dashed p-6 text-center text-muted-foreground">
                <Mail className="mx-auto mb-2 size-6" />
                まだメールアカウントがありません。右上の「メールアカウントを追加」から登録してください。
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
                        {a.imap_host !== "imap.gmail.com" && <p className="text-xs text-muted-foreground">{a.imap_host}:{a.imap_port} / {a.smtp_host}:{a.smtp_port}</p>}
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
          <CardHeader><CardTitle className="text-base">Gmail アカウントの追加手順</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-4">
            <ol className="list-decimal pl-5 space-y-2">
              <li>追加したい Google アカウントで 2 段階認証を有効にし、<a className="underline" href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer">アプリパスワード</a>を発行します。</li>
              <li>Gmail の設定 → 「メール転送と POP/IMAP」で IMAP を有効にします。</li>
              <li>「メールアカウントを追加」でメールアドレスとアプリパスワードを登録し、「接続テスト」で確認します。</li>
              <li>「今すぐ同期」を押すと、そのアカウントの直近 30 日分のメールを取り込みます。</li>
            </ol>
            <p className="text-muted-foreground">
              定期同期は <code className="rounded bg-muted px-1">GET /api/mail/sync</code> を <code className="rounded bg-muted px-1">Authorization: Bearer &lt;CRON_SECRET&gt;</code> 付きで呼び出します。登録済みの全アカウントがまとめて同期されます。
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
