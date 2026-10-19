"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { saveCampaignSettings } from "@/actions/settings";
import type { CampaignSettings } from "@/lib/settings";
import { buildCampaignFooter } from "@/lib/campaigns-shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { actionErrorMessage } from "@/lib/errors";

/** 設定画面「一斉配信」: 送信者情報(本文末尾に自動で付く)と 1 日の送信上限 */
export function CampaignSettingsForm({ settings, siteUrl }: { settings: CampaignSettings; siteUrl: string }) {
  const [form, setForm] = useState(settings);
  const [pending, start] = useTransition();
  return (
    <form
      className="space-y-4"
      action={(fd) =>
        start(async () => {
          try {
            await saveCampaignSettings(fd);
            toast.success("保存しました");
          } catch (e) {
            toast.error(actionErrorMessage(e));
          }
        })
      }
    >
      <div className="grid gap-1.5">
        <Label htmlFor="campaign_footer">送信者情報(会社名・住所・電話番号またはメールアドレス)</Label>
        <Textarea id="campaign_footer" name="campaign_footer" rows={3} value={form.campaign_footer} onChange={(e) => setForm({ ...form, campaign_footer: e.target.value })} placeholder={"株式会社サンプル\n東京都千代田区1-1-1\nTEL 03-0000-0000 / info@example.co.jp"} />
        <p className="text-xs text-muted-foreground">特定電子メール法で広告・宣伝のメールに表示が必要な項目です。配信の本文末尾に、配信停止リンクと一緒に自動で付きます(未入力だと配信できません)。</p>
      </div>
      <div className="grid gap-1.5 sm:max-w-xs">
        <Label htmlFor="campaign_daily_limit">送信元アカウント 1 つあたりの 1 日の送信上限(通)</Label>
        <Input id="campaign_daily_limit" name="campaign_daily_limit" type="number" min={1} max={5000} value={form.campaign_daily_limit} onChange={(e) => setForm({ ...form, campaign_daily_limit: e.target.value })} />
        <p className="text-xs text-muted-foreground">Gmail は 500 通/日、Google Workspace は 2,000 通/日が目安です。超えるとメールサービス側で送信が止められるため、余裕を持った値にしてください。上限に達した配信は翌日に続きを送ります。</p>
      </div>
      <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs">
        <p className="mb-1 text-muted-foreground">本文の末尾に付く文(例)</p>
        <pre className="whitespace-pre-wrap font-sans">{buildCampaignFooter(form.campaign_footer || "(送信者情報)", `${siteUrl}/u/xxxxxxxx`)}</pre>
      </div>
      <Button type="submit" size="sm" disabled={pending}>{pending ? "保存中..." : "保存"}</Button>
    </form>
  );
}
