"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { FileText, Trophy } from "lucide-react";
import { moveDealStage, type RevenueLine } from "@/actions/deals";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RevenueLinesEditor } from "./revenue-lines-editor";
import { monthStart, nowInTz } from "@/lib/format";
import { format } from "date-fns";
import { DatePicker } from "@/components/date-picker/date-picker";
import { STAGE_LABEL, type DealStage } from "@/lib/types";

import { actionErrorMessage } from "@/lib/errors";
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
                  toast.error(actionErrorMessage(e));
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
                  toast.error(actionErrorMessage(e));
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

/**
 * 提案書の提出日を聞くダイアログ(0046)。提出日が空の案件を「提案済み」「検討中」「保留」に動かしたときに出す。
 * 既定は今日。「提出日は入れずに動かす」でステージだけ変えられ、後から案件の「編集」で登録できる。
 */
export function ProposalDialog({
  deal,
  stage,
  open,
  onOpenChange,
  onDone,
}: {
  deal: { id: string; title: string } | null;
  stage: DealStage | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** 動かし終えたとき。submittedOn は登録した提出日(入れなかったら null) */
  onDone?: (submittedOn: string | null) => void;
}) {
  const [pending, start] = useTransition();
  const label = stage ? STAGE_LABEL[stage] : "";

  function move(form: HTMLFormElement | null, withDate: boolean) {
    if (!deal || !stage) return;
    const picked = withDate ? String(new FormData(form ?? undefined).get("proposal_submitted_on") ?? "") : "";
    if (withDate && !picked) return void toast.error("提出日を選んでください");
    start(async () => {
      try {
        await moveDealStage(deal.id, stage, picked ? { proposalSubmittedOn: picked } : {});
        toast.success(picked ? `「${label}」に動かし、提案書の提出日を登録しました` : `ステージを「${label}」に変更しました`);
        onOpenChange(false);
        onDone?.(picked || null);
      } catch (e) {
        toast.error(actionErrorMessage(e));
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form key={`${deal?.id}-${stage}`} onSubmit={(e) => { e.preventDefault(); move(e.currentTarget, true); }} className="grid gap-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><FileText className="size-5 text-primary" /> 提案書の提出日</DialogTitle>
            <DialogDescription>
              「{deal?.title}」を「{label}」に動かします。提案書を出した日を登録すると、カードに提出からの経過日数が出ます。
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="stage-proposal-open">提出日</Label>
            <DatePicker name="proposal_submitted_on" idPrefix="stage-proposal" mode="date" quick="past" defaultValue={format(nowInTz(), "yyyy-MM-dd")} emptyLabel="未選択" />
            <p className="text-xs text-muted-foreground">後から案件の「編集」で直せます。</p>
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            <Button type="button" variant="ghost" disabled={pending} onClick={(e) => move(e.currentTarget.form, false)}>提出日は入れずに動かす</Button>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>キャンセル</Button>
              <Button type="submit" disabled={pending || !deal}>{pending ? "保存中..." : `「${label}」にする`}</Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
