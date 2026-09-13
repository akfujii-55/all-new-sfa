import Link from "next/link";
import { LEGAL_PAGES } from "@/lib/legal";

/** ログイン・申し込み画面などに置く法務ページへのリンク */
export function LegalLinks({ className = "" }: { className?: string }) {
  return (
    <nav className={`flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground ${className}`}>
      {LEGAL_PAGES.map((p) => (
        <Link key={p.href} href={p.href} className="underline-offset-2 hover:underline">
          {p.label}
        </Link>
      ))}
    </nav>
  );
}
