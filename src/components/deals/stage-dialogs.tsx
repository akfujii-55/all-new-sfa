"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Trophy } from "lucide-react";
import { moveDealStage, type RevenueLine } from "@/actions/deals";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RevenueLinesEditor } from "./revenue-lines-editor";
import { monthStart } from "@/lib/format";

export function WonDialog({
  deal,
  open,
  onOpenChange,
  onDone,
  onCancel,
}: {
  deal: { id: string; title: string; amount: number } | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onDone?: () => void;
  onCancel?: () => void;
}) {
  const [pending, start] = useTransition();
  const [lines, setLines] = useState<RevenueLine[]>([{ year_month: monthStart(), amount: deal?.amount ?? 0, memo: "" }]);
  const key = deal?.id;
  const [prevKey, setPrevKey] = useState(key);
  if (key !== prevKey) {
    setPrevKey(key);
    setLines([{ year_month: monthStart(), amount: deal?.amount ?? 0, memo: "" }]);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel?.(); onOpenChange(o); }}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Trophy className="size-5 text-emerald-500" /> 成約: 売上を計上</DialogTitle>
          <DialogDescription>
            「{deal?.title}」を成約にします。売上を計上する月と金額を入力してください。複数月に分割できます。
          </DialogDescription>
        </DialogHeader>
        <RevenueLinesEditor lines={lines} onChange={setLines} />
        <DialogFooter>
          <Button variant="outline" onClick={() => { onCancel?.(); onOpenChange(false); }}>キャンセル</Button>
          <Button
            disabled={pending || !deal}
            onClick={() =>
              start(async () => {
                if (!deal) return;
                try {
                  await moveDealStage(deal.id, "won", { revenues: lines });
                  toast.success("成約にしました。売上を計上しました。");
                  onOpenChange(false);
                  onDone?.();
                } catch (e) {
                  toast.error((e as Error).message);
                }
              })
            }
          >
            {pending ? "保存中..." : "成約にする"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function LostDialog({
  deal,
  open,
  onOpenChange,
  onDone,
  onCancel,
}: {
  deal: { id: string; title: string } | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onDone?: () => void;
  onCancel?: () => void;
}) {
  const [pending, start] = useTransition();
  const [reason, setReason] = useState("");
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel?.(); onOpenChange(o); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>失注にする</DialogTitle>
          <DialogDescription>「{deal?.title}」を失注にします。理由を残しておくと振り返りに役立ちます。</DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5">
          <Label>失注理由</Label>
          <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="価格が合わなかった、競合に決定、時期未定 など" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { onCancel?.(); onOpenChange(false); }}>キャンセル</Button>
          <Button
            variant="destructive"
            disabled={pending || !deal}
            onClick={() =>
              start(async () => {
                if (!deal) return;
                try {
                  await moveDealStage(deal.id, "lost", { lostReason: reason });
                  toast.success("失注にしました");
                  onOpenChange(false);
                  onDone?.();
                } catch (e) {
                  toast.error((e as Error).message);
                }
              })
            }
          >
            {pending ? "保存中..." : "失注にする"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
