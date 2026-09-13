import Link from "next/link";
import { LEGAL_PAGES, OPERATOR, SERVICE_NAME } from "@/lib/legal";

/** 公開ページ(ログイン不要)。利用規約・プライバシーポリシー・特定商取引法に基づく表記 */
export default function LegalLayout({ children }: LayoutProps<"/legal">) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <Link href="/login" className="flex items-center gap-2 font-semibold">
            <span className="inline-flex size-8 items-center justify-center rounded-lg bg-zinc-950 text-white font-bold">S</span>
            {SERVICE_NAME}
          </Link>
          <nav className="hidden sm:flex gap-4 text-sm text-muted-foreground">
            {LEGAL_PAGES.map((p) => (
              <Link key={p.href} href={p.href} className="hover:text-foreground">
                {p.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
        <article className="legal-doc">{children}</article>
      </main>
      <footer className="border-t">
        <div className="mx-auto flex max-w-3xl flex-col gap-2 px-6 py-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <nav className="flex flex-wrap gap-x-4 gap-y-1">
            {LEGAL_PAGES.map((p) => (
              <Link key={p.href} href={p.href} className="hover:text-foreground">
                {p.label}
              </Link>
            ))}
            <Link href="/login" className="hover:text-foreground">ログイン</Link>
            <Link href="/signup" className="hover:text-foreground">お申し込み</Link>
          </nav>
          <p>© {new Date().getFullYear()} {OPERATOR.name}</p>
        </div>
      </footer>
    </div>
  );
}
