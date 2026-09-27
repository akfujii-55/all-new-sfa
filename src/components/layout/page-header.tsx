import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  actions,
  hideDescriptionOnMobile = false,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  /** 一覧の操作が多い画面で、スマホでは説明文を省いて一覧を早く見せる */
  hideDescriptionOnMobile?: boolean;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className={cn("mt-1 text-sm text-muted-foreground", hideDescriptionOnMobile && "hidden sm:block")}>{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
