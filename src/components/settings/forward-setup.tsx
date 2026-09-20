"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { CheckCircle2, Clock, Copy } from "lucide-react";
import { checkForwardArrival, regenerateInboundAddress } from "@/actions/mail-accounts";
import { Button } from "@/components/ui/button";
import { FORWARD_GUIDES } from "@/lib/mail/providers";
import { actionErrorMessage } from "@/lib/errors";

/** 受け口アドレスとコピーボタン */
export function InboundAddress({ address }: { address: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <code className="min-w-0 flex-1 basis-60 break-all rounded-md border bg-background px-2 py-1 text-xs">{address}</code>
      <Button
        type="button" size="sm" variant="outline"
        onClick={async () => {
          try { await navigator.clipboard.writeText(address); toast.success("受け口アドレスをコピーしました"); }
          catch { toast.error("コピーできませんでした。アドレスを選択してコピーしてください"); }
        }}
      >
        <Copy className="size-3.5" /> コピー
      </Button>
    </div>
  );
}

/** メールサービス別の転送の設定手順 */
export function ForwardGuide() {
  const [name, setName] = useState(FORWARD_GUIDES[0].name);
  const guide = FORWARD_GUIDES.find((g) => g.name === name) ?? FORWARD_GUIDES[0];
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {FORWARD_GUIDES.map((g) => (
          <Button key={g.name} type="button" size="sm" variant={g.name === name ? "default" : "outline"} className="h-6 rounded-full px-2.5 text-xs" onClick={() => setName(g.name)}>
            {g.name}
          </Button>
        ))}
      </div>
      <ol className="list-decimal space-y-0.5 pl-5 text-xs">
        {guide.steps.map((s) => <li key={s}>{s}</li>)}
      </ol>
    </div>
  );
}

export const BCC_HINT = "普段のメールソフトから送るときに、このアドレスを BCC に入れると送信メールも記録されます(このアプリから送ったメールは自動で記録されます)。";

/** 「届いたか確認する」: 受け口を同期して、このアカウントの受信メールがあるか確かめる */
export function ArrivalCheck({ id, onReceived }: { id: string; onReceived?: () => void }) {
  const [state, setState] = useState<{ received: number; error: string | null } | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button" size="sm" variant="outline" disabled={pending}
        onClick={() =>
          start(async () => {
            try {
              const r = await checkForwardArrival(id);
              setState(r);
              if (r.received > 0) onReceived?.();
            } catch (e) {
              toast.error(actionErrorMessage(e));
            }
          })
        }
      >
        {pending ? "確認中..." : "届いたか確認する"}
      </Button>
      {state?.error ? (
        <span className="text-xs text-destructive">{state.error}</span>
      ) : state && state.received > 0 ? (
        <span className="flex items-center gap-1 text-xs text-emerald-600"><CheckCircle2 className="size-3.5" /> {state.received} 通届いています。設定は完了です</span>
      ) : state ? (
        <span className="flex items-center gap-1 text-xs text-amber-600"><Clock className="size-3.5" /> まだ届いていません。転送を設定してから、このアドレス宛てにテストメールを送ってください</span>
      ) : null}
    </div>
  );
}

/** 一覧の行に出す受け口アドレスの欄(コピー・手順・到着確認・再発行) */
export function ForwardSetupPanel({ id, email, address, received }: { id: string; email: string; address: string; received: boolean }) {
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();
  return (
    <div className="mt-2 space-y-2 rounded-lg bg-muted/60 p-3">
      <p className="text-xs"><span className="font-medium">受け口アドレス</span> このアドレスへの自動転送を、{email} のメールサーバーで設定してください。</p>
      <InboundAddress address={address} />
      <details className="text-xs text-muted-foreground" open={!received}>
        <summary className="cursor-pointer">転送の設定手順 / 送信メールも記録するには</summary>
        <div className="mt-2 space-y-2 text-foreground">
          <ForwardGuide />
          <p className="text-muted-foreground">{BCC_HINT}</p>
          {!received && <ArrivalCheck id={id} />}
          {!confirm ? (
            <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs text-destructive" onClick={() => setConfirm(true)}>アドレスを再発行</Button>
          ) : (
            <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
              <span>古いアドレス宛ての転送は届かなくなります。メールサーバーの転送先も変更してください。</span>
              <Button
                type="button" size="sm" variant="destructive" disabled={pending}
                onClick={() =>
                  start(async () => {
                    try { await regenerateInboundAddress(id); toast.success("受け口アドレスを再発行しました"); setConfirm(false); }
                    catch (e) { toast.error(actionErrorMessage(e)); }
                  })
                }
              >
                再発行する
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setConfirm(false)}>やめる</Button>
            </div>
          )}
        </div>
      </details>
    </div>
  );
}
