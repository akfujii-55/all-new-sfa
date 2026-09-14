"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { BellRing } from "lucide-react";
import { saveOperatorAlertSettings, sendOperatorTestAlert } from "@/actions/admin";
import type { OperatorAlertSettings } from "@/lib/alerts";
import { actionErrorMessage } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function OperatorAlertForm({ settings }: { settings: OperatorAlertSettings }) {
  const [pending, start] = useTransition();
  const [testing, startTest] = useTransition();

  return (
    <form
      className="space-y-4"
      action={(fd) =>
        start(async () => {
          try {
            await saveOperatorAlertSettings(fd);
            toast.success("保存しました");
          } catch (e) {
            toast.error(actionErrorMessage(e));
          }
        })
      }
    >
      <div className="grid gap-1.5">
        <Label htmlFor="alert_emails">通知先メールアドレス</Label>
        <Input id="alert_emails" name="alert_emails" defaultValue={settings.alert_emails} placeholder="a@example.co.jp, b@example.co.jp" />
        <p className="text-xs text-muted-foreground">カンマ区切りで複数可。運営側の会社の既定の差出人アカウントから送ります。空にするとメールは送りません。</p>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="alert_lark_webhook">Lark グループチャットの Webhook URL</Label>
        <Input id="alert_lark_webhook" name="alert_lark_webhook" defaultValue={settings.alert_lark_webhook} placeholder="https://open.larksuite.com/open-apis/bot/v2/hook/..." />
        <p className="text-xs text-muted-foreground">
          Lark のグループ設定 → ボット → 「カスタムボット」を追加すると発行されます。空にすると Lark には送りません。
        </p>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="alert_lark_secret">Lark の署名シークレット(任意)</Label>
        <Input id="alert_lark_secret" name="alert_lark_secret" defaultValue={settings.alert_lark_secret} autoComplete="off" />
        <p className="text-xs text-muted-foreground">カスタムボットのセキュリティ設定で「署名検証」を有効にした場合だけ入力します。</p>
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          type="button" variant="outline" disabled={testing || pending}
          onClick={() =>
            startTest(async () => {
              try {
                const r = await sendOperatorTestAlert();
                if (r.ok) toast.success(`テスト通知を送りました(${r.message})`);
                else toast.error(`テスト通知に失敗: ${r.message}`);
              } catch (e) {
                toast.error(actionErrorMessage(e));
              }
            })
          }
        >
          <BellRing className="size-4" /> {testing ? "送信中..." : "テスト通知を送る"}
        </Button>
        <Button type="submit" size="sm" disabled={pending}>{pending ? "保存中..." : "保存"}</Button>
      </div>
    </form>
  );
}
