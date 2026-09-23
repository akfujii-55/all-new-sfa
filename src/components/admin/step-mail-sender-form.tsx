"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { saveStepMailSender } from "@/actions/step-mails";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { actionErrorMessage } from "@/lib/errors";
import type { StepMailAccountOption, StepMailSenderSettings } from "@/lib/step-mails-shared";

/** ステップメールの送信元(運営管理)。送信に使うアカウントと、差出人アドレス・名前の上書き */
export function StepMailSenderForm({ settings, accounts }: { settings: StepMailSenderSettings; accounts: StepMailAccountOption[] }) {
  const [pending, start] = useTransition();
  const [accountId, setAccountId] = useState(accounts.some((a) => a.id === settings.account_id) ? settings.account_id : "");
  const [fromEmail, setFromEmail] = useState(settings.from_email);
  const [fromName, setFromName] = useState(settings.from_name);

  const selected = accounts.find((a) => a.id === accountId) ?? accounts.find((a) => a.is_default) ?? accounts[0];
  const missing = settings.account_id && !accounts.some((a) => a.id === settings.account_id);
  const effectiveEmail = fromEmail.trim() || selected?.email || "";
  const effectiveName = fromName.trim() || selected?.from_name || "";

  return (
    <form
      className="rounded-lg border bg-card p-4"
      action={(fd) =>
        start(async () => {
          try {
            await saveStepMailSender(fd);
            toast.success("送信元を保存しました");
          } catch (e) {
            toast.error(actionErrorMessage(e));
          }
        })
      }
    >
      <h2 className="text-sm font-semibold">送信元</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        自動送信と「自分にテスト送信」の差出人です。空のままなら、運営側の既定のメールアカウントから、そのアカウントの名前とアドレスで送ります。
      </p>
      {accounts.length === 0 && (
        <p className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          運営側の会社にメールアカウントがありません。先に設定画面でメールアカウントを追加してください。
        </p>
      )}
      {missing && (
        <p className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          前に選んだメールアカウントが見つかりません(無効化または削除)。いまは既定のアカウントで送っています。選び直して保存してください。
        </p>
      )}
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <div className="grid min-w-0 gap-1.5">
          <Label htmlFor="sm-account">送信に使うアカウント</Label>
          <select id="sm-account" name="account_id" value={accountId} onChange={(e) => setAccountId(e.target.value)} className="h-9 w-full min-w-0 max-w-full truncate rounded-md border bg-background px-2 text-sm">
            <option value="">既定のアカウント</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label === a.email ? a.email : `${a.label} <${a.email}>`}{a.is_default ? "(既定)" : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="grid min-w-0 gap-1.5">
          <Label htmlFor="sm-from-email">差出人アドレス(任意)</Label>
          <Input id="sm-from-email" name="from_email" type="email" value={fromEmail} onChange={(e) => setFromEmail(e.target.value)} placeholder={selected?.email ?? "info@example.co.jp"} autoComplete="off" />
        </div>
        <div className="grid min-w-0 gap-1.5">
          <Label htmlFor="sm-from-name">差出人名(任意)</Label>
          <Input id="sm-from-name" name="from_name" value={fromName} onChange={(e) => setFromName(e.target.value)} placeholder={selected?.from_name ?? "SFA サポート"} autoComplete="off" />
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-2">
        <div className="text-xs text-muted-foreground">
          {selected && (
            <p>
              受け取る側には <span className="font-medium text-foreground">{effectiveName ? `${effectiveName} <${effectiveEmail}>` : effectiveEmail}</span> として届きます。
            </p>
          )}
          <p>
            差出人アドレスを変えても、送信(SMTP)は選んだアカウントで行います。そのアカウントで送信できるアドレス(Gmail の「他のメールアドレスから送信」で登録したエイリアスなど)を入れてください。登録していないアドレスは、サーバー側でアカウントのアドレスに書き換えられるか、送信を拒否されます。返信先(Reply-To)には差出人アドレスを付けます。
          </p>
        </div>
        <Button type="submit" size="sm" disabled={pending || accounts.length === 0}>{pending ? "保存中..." : "保存"}</Button>
      </div>
    </form>
  );
}
