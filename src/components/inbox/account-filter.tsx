import Link from "next/link";
import { AtSign, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MailAccountOption } from "@/lib/types";

/** メールアカウント(受信・送信に使った mail_accounts)で絞り込むリンクの列。タグの絞り込み(tag-filter.tsx)と同じ形 */
export function AccountFilter({ accounts, active, hrefFor }: { accounts: MailAccountOption[]; active: string | null; hrefFor: (accountId: string | null) => string }) {
  if (accounts.length < 2) return null;
  return (
    <div className="mb-3 flex flex-wrap items-center gap-1.5 text-sm">
      <AtSign className="size-4 text-muted-foreground" />
      <span className="mr-1 text-muted-foreground">アカウント:</span>
      {accounts.map((a) => (
        <Link
          key={a.id}
          href={hrefFor(active === a.id ? null : a.id)}
          title={a.email}
          className={cn(
            "rounded-md border px-2 py-1 text-xs transition-colors",
            active === a.id ? "border-foreground bg-foreground text-background" : "text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
        >
          {a.label || a.email}
        </Link>
      ))}
      {active && (
        <Link href={hrefFor(null)} className="ml-1 inline-flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground"><X className="size-3" /> 解除</Link>
      )}
    </div>
  );
}
