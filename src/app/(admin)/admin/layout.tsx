import Link from "next/link";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { ArrowLeft, Building2, Settings } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "運営管理" };

/** 運営者(operators)だけが入れる管理画面。テナントの一覧・作成・上限と課金状態の管理を行う */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login?next=/admin");
  const { data: isOperator } = await supabase.rpc("is_operator");
  if (!isOperator) redirect("/");

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 md:px-6">
          <Link href="/admin" className="font-semibold tracking-tight">SFA 運営管理</Link>
          <nav className="flex items-center gap-1 text-sm">
            <Link href="/admin" className="flex items-center gap-1.5 rounded-md px-2 py-1 text-muted-foreground hover:bg-muted hover:text-foreground"><Building2 className="size-4" /> テナント</Link>
            <Link href="/admin/settings" className="flex items-center gap-1.5 rounded-md px-2 py-1 text-muted-foreground hover:bg-muted hover:text-foreground"><Settings className="size-4" /> 料金・既定値</Link>
          </nav>
          <Link href="/" className="ml-auto flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> アプリへ戻る</Link>
        </div>
      </header>
      <main className="mx-auto max-w-6xl p-4 md:p-6">{children}</main>
    </div>
  );
}
