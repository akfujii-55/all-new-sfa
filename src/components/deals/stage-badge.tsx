import { Badge } from "@/components/ui/badge";
import { DEAL_STAGES, type DealStage } from "@/lib/types";
import { cn } from "@/lib/utils";

export function StageBadge({ stage, className }: { stage: DealStage; className?: string }) {
  const s = DEAL_STAGES.find((x) => x.key === stage)!;
  return (
    <Badge variant="outline" className={cn("gap-1.5 font-normal", className)}>
      <span className={cn("size-1.5 rounded-full", s.color)} />
      {s.label}
    </Badge>
  );
}
