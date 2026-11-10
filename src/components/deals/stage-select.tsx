"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { moveDealStage } from "@/actions/deals";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DEAL_STAGES, PROPOSAL_DATE_STAGES, type DealStage } from "@/lib/types";
import { WonDialog, LostDialog, ProposalDialog } from "./stage-dialogs";
import { cn } from "@/lib/utils";

import { actionErrorMessage } from "@/lib/errors";
export function StageSelect({ deal }: { deal: { id: string; title: string; amount: number; stage: DealStage; proposal_submitted_on?: string | null } }) {
  const [pending, start] = useTransition();
  const [won, setWon] = useState(false);
  const [lost, setLost] = useState(false);
  // 提案書の提出日を聞いてから動かすステージ(提出日が空のときだけ)
  const [proposalStage, setProposalStage] = useState<DealStage | null>(null);
  const current = DEAL_STAGES.find((s) => s.key === deal.stage)!;
  return (
    <>
      <Select
        value={deal.stage}
        disabled={pending}
        onValueChange={(v) => {
          const stage = v as DealStage;
          if (stage === deal.stage) return;
          if (stage === "won") return setWon(true);
          if (stage === "lost") return setLost(true);
          if (PROPOSAL_DATE_STAGES.includes(stage) && !deal.proposal_submitted_on) return setProposalStage(stage);
          start(async () => {
            try {
              await moveDealStage(deal.id, stage);
              toast.success(`ステージを「${DEAL_STAGES.find((s) => s.key === stage)?.label}」に変更しました`);
            } catch (e) {
              toast.error(actionErrorMessage(e));
            }
          });
        }}
      >
        <SelectTrigger className="w-40">
          <span className="flex items-center gap-2"><span className={cn("size-2 rounded-full", current.color)} /><SelectValue /></span>
        </SelectTrigger>
        <SelectContent>
          {DEAL_STAGES.map((s) => (
            <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <WonDialog deal={deal} open={won} onOpenChange={setWon} />
      <LostDialog deal={deal} open={lost} onOpenChange={setLost} />
      <ProposalDialog deal={deal} stage={proposalStage} open={!!proposalStage} onOpenChange={(o) => !o && setProposalStage(null)} />
    </>
  );
}
