"use client";

import { useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { saveMailAccount, deleteMailAccount } from "@/actions/mail-accounts";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GMAIL_HOSTS, PROVIDER_EXAMPLES, PROVIDER_LABEL, providerOf, type MailProvider } from "@/lib/mail/providers";
import type { MailAccount } from "@/lib/types";
import { ArrivalCheck, BCC_HINT, ForwardGuide, InboundAddress } from "@/components/settings/forward-setup";

import { actionErrorMessage } from "@/lib/errors";
type AccountRow = Omit<MailAccount, "password_enc">;

type ForwardNext = { id: string; address: string; smtpError: string | null };

/** forwardEnabled: 運営側で転送メールの受信用メールボックスが設定されているとき true(「メール転送で受信」を選べる) */
export function MailAccountDialog({ trigger, account, forwardEnabled = false }: { trigger: ReactNode; account?: AccountRow; forwardEnabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [provider, setProvider] = useState<MailProvider>(account ? providerOf(account) : "gmail");
  const [active, setActive] = useState(account?.is_active ?? true);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, start] = useTransition();
  // 転送で受信するアカウントを追加した直後は、閉じずに転送の設定を案内する
  const [next, setNext] = useState<ForwardNext | null>(null);
  const [arrived, setArrived] = useState(false);
  const gmail = provider === "gmail";
  const forward = provider === "forward";
  const custom = account && providerOf(account) !== "gmail" ? account : undefined;
  const providers = (Object.keys(PROVIDER_LABEL) as MailProvider[]).filter((k) => k !== "forward" || forwardEnabled || (account && providerOf(account) === "forward"));

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setConfirmDelete(false); setNext(null); setArrived(false); } }}>
      <DialogTrigger asChild>
        <span className="contents">{trigger}</span>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        {next ? (
          <>
            <DialogHeader>
              <DialogTitle>次に、メールの転送を設定してください</DialogTitle>
              <DialogDescription>
                受信は、下の受け口アドレスへの自動転送をご利用のメールサーバーで設定すると始まります。
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 text-sm">
              {next.smtpError ? (
                <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                  送信(SMTP)の接続は確認できませんでした: {next.smtpError} 受信は転送だけで始められます。送信の設定はあとで鉛筆ボタンから見直してください。
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">送信(SMTP)の接続を確認しました。</p>
              )}
              <div className="rounded-lg bg-muted/60 p-3"><InboundAddress address={next.address} /></div>
              <div className="space-y-1.5">
                <p className="font-medium">設定手順</p>
                <ForwardGuide />
              </div>
              <p className="text-xs text-muted-foreground">{BCC_HINT}</p>
              <ArrivalCheck id={next.id} onReceived={() => setArrived(true)} />
            </div>
            <DialogFooter>
              <Button type="button" variant={arrived ? "default" : "outline"} onClick={() => setOpen(false)}>{arrived ? "完了" : "あとで設定する"}</Button>
            </DialogFooter>
          </>
        ) : (
        <>
        <DialogHeader>
          <DialogTitle>{account ? "メールアカウントを編集" : "メールアカウントを追加"}</DialogTitle>
          <DialogDescription>
            受信トレイと送信済みメールの取り込み(IMAP、またはメール転送)と、このアプリからの送信(SMTP)に使うアカウントです。パスワードは暗号化して保存されます。
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          action={(fd) =>
            start(async () => {
              try {
                fd.set("is_active", String(active));
                fd.set("receive_mode", forward ? "forward" : "imap");
                if (gmail) {
                  fd.set("imap_host", GMAIL_HOSTS.imap_host); fd.set("imap_port", String(GMAIL_HOSTS.imap_port));
                  fd.set("smtp_host", GMAIL_HOSTS.smtp_host); fd.set("smtp_port", String(GMAIL_HOSTS.smtp_port));
                  fd.set("login_user", "");
                }
                const saved = await saveMailAccount(account?.id ?? null, fd);
                toast.success("保存しました");
                if (saved.forward) setNext(saved.forward);
                else setOpen(false);
              } catch (e) {
                toast.error(actionErrorMessage(e));
              }
            })
          }
        >
          <div className="grid gap-1.5">
            <Label>メールサービス</Label>
            <Select value={provider} onValueChange={(v) => setProvider(v as MailProvider)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {providers.map((k) => (
                  <SelectItem key={k} value={k}>{PROVIDER_LABEL[k]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {gmail ? (
              <p className="text-xs text-muted-foreground">
                <a className="underline" href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer">Google のアプリパスワード</a>
                のページに連携する Gmail アカウントでログインしてパスワードを発行し、下のパスワード欄に入力してください(2 段階認証が必要です)。
              </p>
            ) : forward ? (
              <p className="rounded-md bg-muted p-2 text-xs">
                受信は、保存後に発行される<span className="font-medium">受け口アドレス</span>への自動転送で行います。ここでは送信に使う SMTP の情報だけを入力します。
                Microsoft 365 は SMTP 認証が無効になっていることがあり、その場合は受信のみになります。
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                ご利用のメールサービスの「メールソフトの設定」に記載されている IMAP / SMTP サーバー名とポートを入力してください。SSL は IMAP 993 / SMTP 465、STARTTLS は IMAP 143 / SMTP 587 が一般的です。暗号化なしの接続には対応していません。
              </p>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="email">メールアドレス *</Label>
              <Input id="email" name="email" type="email" defaultValue={account?.email ?? ""} required />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="label">表示名(アプリ内)</Label>
              <Input id="label" name="label" defaultValue={account?.label ?? ""} placeholder="営業窓口" />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="password">{gmail ? "Google アプリパスワード" : forward ? "SMTP のパスワード" : "パスワード"}{account ? "" : " *"}</Label>
              <Input id="password" name="password" type="password" autoComplete="off" placeholder={account ? "変更する場合のみ入力" : gmail ? "xxxx xxxx xxxx xxxx" : ""} required={!account} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="from_name">差出人名(メールに表示)</Label>
              <Input id="from_name" name="from_name" defaultValue={account?.from_name ?? ""} placeholder="株式会社サンプル 営業部" />
            </div>
          </div>

          {!gmail && (
            <>
              <div className={forward ? "grid gap-3 grid-cols-[1fr_90px]" : "grid gap-3 sm:grid-cols-[1fr_90px_1fr_90px]"}>
                {!forward && (
                  <>
                    <div className="grid gap-1.5">
                      <Label htmlFor="imap_host">IMAP サーバー *</Label>
                      <Input id="imap_host" name="imap_host" defaultValue={custom && providerOf(custom) === "other" ? custom.imap_host : ""} placeholder="imap.example.jp" required />
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor="imap_port">ポート</Label>
                      <Input id="imap_port" name="imap_port" inputMode="numeric" defaultValue={custom && providerOf(custom) === "other" ? custom.imap_port : 993} />
                    </div>
                  </>
                )}
                <div className="grid gap-1.5">
                  <Label htmlFor="smtp_host">SMTP サーバー *</Label>
                  <Input id="smtp_host" name="smtp_host" defaultValue={custom?.smtp_host ?? ""} placeholder="smtp.example.jp" required />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="smtp_port">ポート</Label>
                  <Input id="smtp_port" name="smtp_port" inputMode="numeric" defaultValue={custom?.smtp_port ?? 465} />
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="login_user">ログイン ID(メールアドレスと違う場合のみ)</Label>
                <Input id="login_user" name="login_user" autoComplete="off" defaultValue={account?.login_user ?? ""} placeholder="空欄ならメールアドレスでログインします" />
              </div>
              <details className="text-xs text-muted-foreground" hidden={forward}>
                <summary className="cursor-pointer">よくあるサーバー設定の例</summary>
                <ul className="mt-1 space-y-0.5 pl-4 list-disc">
                  {PROVIDER_EXAMPLES.map((ex) => (
                    <li key={ex.name}>
                      {ex.name}: IMAP {ex.imap} / SMTP {ex.smtp}
                      {ex.note && `(${ex.note})`}
                    </li>
                  ))}
                </ul>
              </details>
            </>
          )}

          <div className="grid gap-1.5">
            <Label htmlFor="signature">このアカウント専用の署名(任意)</Label>
            <Textarea
              id="signature"
              name="signature"
              rows={4}
              defaultValue={account?.signature ?? ""}
              placeholder={"株式会社サンプル 営業部\n{{自社担当者}}\nメールアドレス: {{自社メール}}\nTEL: 03-0000-0000"}
            />
            <p className="text-xs text-muted-foreground">
              空欄なら設定画面の共通の署名を使います(メールアドレスの行はこのアカウントのアドレスになります)。
              入力すると、このアカウントから送るときはこの文面が署名になります。<code>{"{{自社担当者}}"}</code> はログイン中の営業担当者名、<code>{"{{自社メール}}"}</code> はこのアカウントのアドレス、<code>{"{{自社会社名}}"}</code> は共通の署名の会社名に置き換わります。区切り線は自動で付きます。
            </p>
          </div>

          {account && (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={active} onCheckedChange={(v) => setActive(v === true)} />
              有効(同期と送信に使う)
            </label>
          )}

          <DialogFooter className={account ? "sm:justify-between" : ""}>
            {account && !confirmDelete && (
              <Button type="button" variant="ghost" className="text-destructive" onClick={() => setConfirmDelete(true)}>削除</Button>
            )}
            {account && confirmDelete && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">取り込んだメールは残ります。</span>
                <Button
                  type="button" variant="destructive" size="sm" disabled={pending}
                  onClick={() =>
                    start(async () => {
                      try { await deleteMailAccount(account.id); toast.success("削除しました"); setOpen(false); }
                      catch (e) { toast.error(actionErrorMessage(e)); }
                    })
                  }
                >
                  削除する
                </Button>
              </div>
            )}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>キャンセル</Button>
              <Button type="submit" disabled={pending}>{pending ? "保存中..." : account ? "保存" : "追加"}</Button>
            </div>
          </DialogFooter>
        </form>
        </>
        )}
      </DialogContent>
    </Dialog>
  );
}
