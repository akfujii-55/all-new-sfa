"use client";

import { useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { saveMailAccount, deleteMailAccount } from "@/actions/mail-accounts";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { MailAccount } from "@/lib/types";

type AccountRow = Omit<MailAccount, "password_enc">;

export function MailAccountDialog({ trigger, account }: { trigger: ReactNode; account?: AccountRow }) {
  const [open, setOpen] = useState(false);
  const [advanced, setAdvanced] = useState(
    Boolean(account && (account.imap_host !== "imap.gmail.com" || account.smtp_host !== "smtp.gmail.com")),
  );
  const [active, setActive] = useState(account?.is_active ?? true);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, start] = useTransition();

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setConfirmDelete(false); }}>
      <DialogTrigger asChild>
        <span className="contents">{trigger}</span>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{account ? "Gmail 連携を編集" : "Gmail アカウントを追加"}</DialogTitle>
          <DialogDescription>
            <a className="underline" href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer">Google のアプリパスワード</a>
            のページに連携する Gmail アカウントでログインしてパスワードを発行し、ここに入力してください(2 段階認証が必要です)。パスワードは暗号化して保存されます。
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          action={(fd) =>
            start(async () => {
              try {
                fd.set("is_active", String(active));
                if (!advanced) {
                  fd.set("imap_host", "imap.gmail.com"); fd.set("imap_port", "993");
                  fd.set("smtp_host", "smtp.gmail.com"); fd.set("smtp_port", "465");
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
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="email">Gmail アドレス *</Label>
              <Input id="email" name="email" type="email" defaultValue={account?.email ?? ""} required />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="label">表示名(アプリ内)</Label>
              <Input id="label" name="label" defaultValue={account?.label ?? ""} placeholder="営業窓口" />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="password">Google アプリパスワード{account ? "" : " *"}</Label>
              <Input id="password" name="password" type="password" autoComplete="off" placeholder={account ? "変更する場合のみ入力" : "xxxx xxxx xxxx xxxx"} required={!account} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="from_name">差出人名(メールに表示)</Label>
              <Input id="from_name" name="from_name" defaultValue={account?.from_name ?? ""} placeholder="株式会社サンプル 営業部" />
            </div>
          </div>

          <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setAdvanced(!advanced)}>
            {advanced ? "▾ サーバー設定(Gmail 以外)" : "▸ サーバー設定(Gmail 以外)"}
          </button>
          {advanced && (
            <div className="grid gap-3 sm:grid-cols-[1fr_90px_1fr_90px]">
              <div className="grid gap-1.5">
                <Label htmlFor="imap_host">IMAP ホスト</Label>
                <Input id="imap_host" name="imap_host" defaultValue={account?.imap_host ?? "imap.gmail.com"} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="imap_port">ポート</Label>
                <Input id="imap_port" name="imap_port" inputMode="numeric" defaultValue={account?.imap_port ?? 993} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="smtp_host">SMTP ホスト</Label>
                <Input id="smtp_host" name="smtp_host" defaultValue={account?.smtp_host ?? "smtp.gmail.com"} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="smtp_port">ポート</Label>
                <Input id="smtp_port" name="smtp_port" inputMode="numeric" defaultValue={account?.smtp_port ?? 465} />
              </div>
            </div>
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
