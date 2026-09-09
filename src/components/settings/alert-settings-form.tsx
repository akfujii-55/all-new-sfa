"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { BellRing } from "lucide-react";
import { saveAlertSettings, sendTestAlert } from "@/actions/settings";
import type { AlertSettings } from "@/lib/settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AlertSettingsForm({ settings, webhookConfigured }: { settings: AlertSettings; webhookConfigured: boolean }) {
  const [emails, setEmails] = useState(settings.alert_emails);
  const [pending, start] = useTransition();
  const [testing, startTest] = useTransition();

  return (
    <form
      className="space-y-3"
      action={(fd) =>
        start(async () => {
          try {
            await saveAlertSettings(fd);
            toast.success("保存しました");
          } catch (e) {
            toast.error((e as Error).message);
          }
        })
      }
    >
      <div className="grid gap-1.5">
        <Label htmlFor="alert_emails">通知先メールアドレス</Label>
        <Input id="alert_emails" name="alert_emails" value={emails} onChange={(e) => setEmails(e.target.value)} placeholder="a@example.co.jp, b@example.co.jp" />
        <p className="text-xs text-muted-foreground">
          カンマ区切りで複数可。エラーが起きると既定の差出人アカウントから送ります(同じ発生箇所は 30 分に 1 回まで)。空にすると通知しません。
          {webhookConfigured ? " Webhook(ALERT_WEBHOOK_URL)にも同時に送ります。" : " Slack などに送りたい場合は環境変数 ALERT_WEBHOOK_URL を設定してください。"}
        </p>
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          type="button" variant="outline" disabled={testing || pending}
          onClick={() =>
            startTest(async () => {
              try {
                const r = await sendTestAlert();
                if (r.ok) toast.success(`テスト通知を送りました(${r.message})`);
                else toast.error(`テスト通知に失敗: ${r.message}`);
              } catch (e) {
                toast.error((e as Error).message);
              }
            })
          }
        >
          <BellRing className="size-4" /> {testing ? "送信中..." : "テスト通知を送る"}
        </Button>
        <Button type="submit" disabled={pending}>{pending ? "保存中..." : "保存"}</Button>
      </div>
    </form>
  );
}
