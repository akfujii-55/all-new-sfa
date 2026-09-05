import { CheckCircle2, XCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MailSyncButton } from "@/components/inbox/mail-sync-button";
import { fmtDateTime } from "@/lib/format";

export const metadata = { title: "設定" };

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: states } = await supabase.from("mail_sync_state").select("*");
  const gmailConfigured = Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
  const aiConfigured = Boolean(process.env.ANTHROPIC_API_KEY);
  const cronConfigured = Boolean(process.env.CRON_SECRET);

  return (
    <div className="max-w-3xl">
      <PageHeader title="設定" description="メール連携の状態と運用手順" />

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Gmail 連携</CardTitle>
            <CardDescription>IMAP で受信トレイ・送信済みを取り込み、SMTP で送信します。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Status ok={gmailConfigured} label={gmailConfigured ? `接続アカウント: ${process.env.GMAIL_USER}` : "GMAIL_USER / GMAIL_APP_PASSWORD が未設定です"} />
            <Status ok={aiConfigured} label={aiConfigured ? "Claude によるメール情報抽出: 有効" : "Claude によるメール情報抽出: 無効(ルールベースで抽出)"} />
            <Status ok={cronConfigured} label={cronConfigured ? "定期同期用 CRON_SECRET: 設定済み" : "定期同期用 CRON_SECRET: 未設定"} />
            <div className="pt-2"><MailSyncButton label="今すぐ同期" /></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">同期状態</CardTitle></CardHeader>
          <CardContent className="text-sm">
            {states?.length ? (
              <div className="divide-y">
                {states.map((s) => (
                  <div key={s.mailbox} className="flex items-center justify-between py-2">
                    <div>
                      <p className="font-medium">{s.mailbox}</p>
                      {s.last_error && <p className="text-xs text-destructive">{s.last_error}</p>}
                    </div>
                    <div className="text-right text-muted-foreground">
                      <p>最終同期 {fmtDateTime(s.last_synced_at)}</p>
                      <p className="text-xs">UID {s.last_uid}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground">まだ同期されていません</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">セットアップ手順</CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-4">
            <ol className="list-decimal pl-5 space-y-2">
              <li>Google アカウントで 2 段階認証を有効にし、<a className="underline" href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer">アプリパスワード</a>を発行します。</li>
              <li>Gmail の設定 → 「メール転送と POP/IMAP」で IMAP を有効にします。</li>
              <li><code className="rounded bg-muted px-1">.env.local</code> に <code className="rounded bg-muted px-1">GMAIL_USER</code> と <code className="rounded bg-muted px-1">GMAIL_APP_PASSWORD</code> を設定して再起動します。</li>
              <li>定期同期は <code className="rounded bg-muted px-1">GET /api/mail/sync</code> を <code className="rounded bg-muted px-1">Authorization: Bearer &lt;CRON_SECRET&gt;</code> 付きで 5 分ごとに呼び出します(Vercel Cron 等)。</li>
            </ol>
            <pre className="rounded-md bg-muted p-3 text-xs overflow-x-auto">{`// vercel.json
{
  "crons": [{ "path": "/api/mail/sync", "schedule": "*/5 * * * *" }]
}`}</pre>
            <p className="text-muted-foreground">
              Gmail を直接受信できない環境では、他のメールアドレスから Gmail へ自動転送を設定してください。転送されたメールも同じ流れで取り込まれます。
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Status({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2">
      {ok ? <CheckCircle2 className="size-4 text-emerald-500" /> : <XCircle className="size-4 text-muted-foreground" />}
      <span>{label}</span>
    </div>
  );
}
