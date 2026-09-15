"use client";

import { AlertTriangle, CheckCircle2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { unresolvedMerges } from "@/lib/mail/merge";
import { fmtBytes } from "@/lib/mail/attachment-shared";

/** 送信前の確認。宛先・件名・本文・添付をまとめて見せ、残っている差し込み項目があれば赤く示して送信を止める */
export function SendPreviewDialog({
  open,
  onOpenChange,
  from,
  to,
  cc,
  subject,
  body,
  files,
  pending,
  sendLabel,
  onSend,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  from: string;
  to: string;
  cc: string;
  subject: string;
  /** 送信される本文そのもの(署名・引用を含む) */
  body: string;
  files: File[];
  pending: boolean;
  sendLabel: string;
  onSend: () => void;
}) {
  const unresolved = unresolvedMerges(`${subject}\n${body}`);
  const problems: string[] = [];
  if (!to.trim().includes("@")) problems.push("宛先が入っていません。");
  if (!subject.trim()) problems.push("件名が入っていません。");
  if (unresolved.length > 0) problems.push(`差し込み項目が反映されていません: ${unresolved.join(" ")}。本文に戻って直してください。`);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex flex-col sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>この内容で送信します</DialogTitle>
          <DialogDescription>宛名や差し込み項目が正しく入っているか確認してください。</DialogDescription>
        </DialogHeader>
        {problems.length > 0 ? (
          <div className="flex gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <div>{problems.map((p) => <p key={p}>{p}</p>)}</div>
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-md bg-muted p-3 text-sm">
            <CheckCircle2 className="size-4 shrink-0 text-emerald-500" /> 差し込み項目はすべて反映されています。
          </div>
        )}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border text-sm">
          <dl className="grid grid-cols-[4rem_1fr] gap-x-3 gap-y-1 bg-muted/50 px-3 py-2 text-xs">
            <dt className="text-muted-foreground">差出人</dt><dd className="min-w-0 break-all">{from}</dd>
            <dt className="text-muted-foreground">宛先</dt><dd className="min-w-0 break-all">{to || <Unresolved>未入力</Unresolved>}</dd>
            <dt className="text-muted-foreground">CC</dt><dd className="min-w-0 break-all">{cc || "—"}</dd>
            <dt className="text-muted-foreground">件名</dt><dd className="min-w-0"><Highlighted text={subject} /></dd>
            <dt className="text-muted-foreground">添付</dt><dd className="min-w-0">{files.length === 0 ? "なし" : files.map((f) => `${f.name}(${fmtBytes(f.size)})`).join(" / ")}</dd>
          </dl>
          <div className="min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap break-words px-3 py-2 font-mono text-xs leading-relaxed"><Highlighted text={body} /></div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>本文に戻る</Button>
          <Button type="button" onClick={onSend} disabled={pending || problems.length > 0}><Send className="size-4" /> {sendLabel}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Unresolved({ children }: { children: React.ReactNode }) {
  return <mark className="rounded bg-destructive/15 px-1 text-destructive">{children}</mark>;
}

/** 残っている {{…}} を赤く強調して表示する */
function Highlighted({ text }: { text: string }) {
  const parts = text.split(/(\{\{[^{}]+\}\})/g);
  return (
    <>
      {parts.map((p, i) => (/^\{\{[^{}]+\}\}$/.test(p) ? <Unresolved key={i}>{p}</Unresolved> : <span key={i}>{p}</span>))}
    </>
  );
}
