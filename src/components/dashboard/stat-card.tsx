import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export function StatCard({ label, value, hint, icon: Icon }: { label: string; value: string; hint?: string; icon: LucideIcon }) {
  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-3 pt-0">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight truncate">{value}</p>
          {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
        </div>
        <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted">
          <Icon className="size-4 text-muted-foreground" />
        </div>
      </CardContent>
    </Card>
  );
}
