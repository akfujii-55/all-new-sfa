"use client";

import { useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { saveMailAccount, deleteMailAccount } from "@/actions/mail-accounts";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GMAIL_HOSTS, PROVIDER_EXAMPLES, PROVIDER_LABEL, providerOf, type MailProvider } from "@/lib/mail/providers";
import type { MailAccount } from "@/lib/types";

type AccountRow = Omit<MailAccount, "password_enc">;

export function MailAccountDialog({ trigger, account }: { trigger: ReactNode; account?: AccountRow }) {
  const [open, setOpen] = useState(false);
  const [provider, setProvider] = useState<MailProvider>(account ? providerOf(account) : "gmail");
  const [active, setActive] = useState(account?.is_active ?? true);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, start] = useTransition();
  const gmail = provider === "gmail";

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setConfirmDelete(false); }}>
      <DialogTrigger asChild>
        <span className="contents">{trigger}</span>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{account ? "メールアカウントを編集" : "メールアカウントを追加"}</DialogTitle>
          <DialogDescription>
            受信トレイと送信済みメールの取り込み(IMAP)と、このアプリからの送信(SMTP)に使うアカウントです。パスワードは暗号化して保存されます。
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          action={(fd) =>
            start(async () => {
              try {
                fd.set("is_active", String(active));
                if (gmail) {
                  fd.set("imap_host", GMAIL_HOSTS.imap_host); fd.set("imap_port", String(GMAIL_HOSTS.imap_port));
                  fd.set("smtp_host", GMAIL_HOSTS.smtp_host); fd.set("smtp_port", String(GMAIL_HOSTS.smtp_port));
                  fd.set("login_user", "");
                }
                await saveMailAccount(account?.id ?? null, fd);
                toast.success("保存しました");
                setOpen(false);
              } catch (e) {
                toast.error((e as Error).message);
              }
            })
          }
        >
          <div className="grid gap-1.5">
            <Label>メールサービス</Label>
            <Select value={provider} onValueChange={(v) => setProvider(v as MailProvider)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(PROVIDER_LABEL) as MailProvider[]).map((k) => (
                  <SelectItem key={k} value={k}>{PROVIDER_LABEL[k]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {gmail ? (
              <p className="text-xs text-muted-foreground">
                <a className="underline" href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer">Google のアプリパスワード</a>
                のページに連携する Gmail アカウントでログインしてパスワードを発行し、下のパスワード欄に入力してください(2 段階認証が必要です)。
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
              <Label htmlFor="password">{gmail ? "Google アプリパスワード" : "パスワード"}{account ? "" : " *"}</Label>
              <Input id="password" name="password" type="password" autoComplete="off" placeholder={account ? "変更する場合のみ入力" : gmail ? "xxxx xxxx xxxx xxxx" : ""} required={!account} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="from_name">差出人名(メールに表示)</Label>
              <Input id="from_name" name="from_name" defaultValue={account?.from_name ?? ""} placeholder="株式会社サンプル 営業部" />
            </div>
          </div>

          {!gmail && (
            <>
              <div className="grid gap-3 sm:grid-cols-[1fr_90px_1fr_90px]">
                <div className="grid gap-1.5">
                  <Label htmlFor="imap_host">IMAP サーバー *</Label>
                  <Input id="imap_host" name="imap_host" defaultValue={account && providerOf(account) === "other" ? account.imap_host : ""} placeholder="imap.example.jp" required />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="imap_port">ポート</Label>
                  <Input id="imap_port" name="imap_port" inputMode="numeric" defaultValue={account && providerOf(account) === "other" ? account.imap_port : 993} />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="smtp_host">SMTP サーバー *</Label>
                  <Input id="smtp_host" name="smtp_host" defaultValue={account && providerOf(account) === "other" ? account.smtp_host : ""} placeholder="smtp.example.jp" required />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="smtp_port">ポート</Label>
                  <Input id="smtp_port" name="smtp_port" inputMode="numeric" defaultValue={account && providerOf(account) === "other" ? account.smtp_port : 465} />
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="login_user">ログイン ID(メールアドレスと違う場合のみ)</Label>
                <Input id="login_user" name="login_user" autoComplete="off" defaultValue={account?.login_user ?? ""} placeholder="空欄ならメールアドレスでログインします" />
              </div>
              <details className="text-xs text-muted-foreground">
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
                      catch (e) { toast.error((e as Error).message); }
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
      </DialogContent>
    </Dialog>
  );
}
