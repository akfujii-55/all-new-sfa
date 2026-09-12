import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Building2, Lock, Settings } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { ADMIN_UNLOCK_HOURS, isAdminCodeConfigured, isAdminUnlocked } from "@/lib/admin-gate";
import { lockAdmin } from "@/actions/admin";
import { AdminUnlockForm } from "@/components/admin/unlock-form";

export const metadata = { title: "運営管理" };

/**
 * 運営者(operators)だけが入れる管理画面。
 * 通常ログインに加えてアクセスコード(ADMIN_ACCESS_CODE)の入力を求め、解除クッキーが無ければ入力画面を出す。
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login?next=/admin");
  const { data: isOperator } = await supabase.rpc("is_operator");
  if (!isOperator) redirect("/");

  const unlocked = await isAdminUnlocked(auth.user.id);

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 md:px-6">
          <Link href="/admin" className="font-semibold tracking-tight">SFA 運営管理</Link>
          {unlocked && (
            <nav className="flex items-center gap-1 text-sm">
              <Link href="/admin" className="flex items-center gap-1.5 rounded-md px-2 py-1 text-muted-foreground hover:bg-muted hover:text-foreground"><Building2 className="size-4" /> テナント</Link>
              <Link href="/admin/settings" className="flex items-center gap-1.5 rounded-md px-2 py-1 text-muted-foreground hover:bg-muted hover:text-foreground"><Settings className="size-4" /> 設定</Link>
            </nav>
          )}
          <div className="ml-auto flex items-center gap-3 text-sm">
            {unlocked && (
              <form action={lockAdmin}>
                <button type="submit" className="flex items-center gap-1 text-muted-foreground hover:text-foreground"><Lock className="size-4" /> ロック</button>
              </form>
            )}
            <Link href="/" className="flex items-center gap-1 text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> アプリへ戻る</Link>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl p-4 md:p-6">
        {unlocked ? (
          children
        ) : isAdminCodeConfigured() ? (
          <AdminUnlockForm hours={ADMIN_UNLOCK_HOURS} />
        ) : (
          <div className="mx-auto mt-16 max-w-md rounded-lg border bg-card p-6 text-sm">
            <p className="font-medium">運営管理は利用できません。</p>
            <p className="mt-2 text-muted-foreground">環境変数 <code className="rounded bg-muted px-1">ADMIN_ACCESS_CODE</code>(運営者用のアクセスコード)が設定されていません。.env.local と Vercel に設定して再デプロイしてください。</p>
          </div>
        )}
      </main>
    </div>
  );
}
