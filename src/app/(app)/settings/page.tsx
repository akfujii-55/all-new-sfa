import { CheckCircle2, XCircle, Mail, Plus, Pencil } from "lucide-react";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { bootstrapEnvAccount } from "@/lib/mail/accounts";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MailSyncButton } from "@/components/inbox/mail-sync-button";
import { MailAccountDialog } from "@/components/settings/mail-account-dialog";
import { MailAccountActions } from "@/components/settings/mail-account-actions";
import { fmtDateTime } from "@/lib/format";
import type { MailAccount } from "@/lib/types";

export const metadata = { title: "設定" };

type AccountRow = Omit<MailAccount, "password_enc">;

export default async function SettingsPage() {
  // 環境変数で設定していた旧アカウントがあれば、初回だけアカウント表へ取り込む
  await bootstrapEnvAccount(createAdminClient());

  const supabase = await createClient();
  const [{ data: accountRows }, { data: states }] = await Promise.all([
    supabase
      .from("mail_accounts")
      .select("id, label, email, from_name, imap_host, imap_port, smtp_host, smtp_port, is_active, is_default, last_error, created_at, updated_at")
      .order("is_default", { ascending: false })
      .order("created_at"),
    supabase.from("mail_sync_state").select("*"),
  ]);
  const accounts = (accountRows ?? []) as AccountRow[];
  const aiConfigured = Boolean(process.env.ANTHROPIC_API_KEY);
  const cronConfigured = Boolean(process.env.CRON_SECRET);

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="設定"
        description="メールアカウントと連携の状態"
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

function Status({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2">
      {ok ? <CheckCircle2 className="size-4 text-emerald-500" /> : <XCircle className="size-4 text-muted-foreground" />}
      <span>{label}</span>
    </div>
  );
}
