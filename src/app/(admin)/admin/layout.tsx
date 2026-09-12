import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Building2, LogOut, Mail, Settings, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenant } from "@/lib/supabase/tenant";
import { signOut } from "@/actions/auth";

export const metadata = { title: "運営管理" };

/**
 * 運営者(operators)だけが入れる管理画面。
 * 運営者はスーパーユーザーが「ユーザー管理」からメールで招待し、パスワードを設定した通常ログインで入る。
 * 運営専用アカウントはテナントに所属しないため、アプリ側の画面には戻れない(ログアウトのみ)。
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login?next=/admin");
  const { data: isOperator } = await supabase.rpc("is_operator");
  if (!isOperator) redirect("/");
  const tenant = await getCurrentTenant(supabase);

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 md:px-6">
          <Link href="/admin" className="font-semibold tracking-tight">SFA 運営管理</Link>
          <nav className="flex items-center gap-1 text-sm">
            <Link href="/admin" className="flex items-center gap-1.5 rounded-md px-2 py-1 text-muted-foreground hover:bg-muted hover:text-foreground"><Building2 className="size-4" /> テナント</Link>
            <Link href="/admin/users" className="flex items-center gap-1.5 rounded-md px-2 py-1 text-muted-foreground hover:bg-muted hover:text-foreground"><Users className="size-4" /> ユーザー管理</Link>
            <Link href="/admin/mail-templates" className="flex items-center gap-1.5 rounded-md px-2 py-1 text-muted-foreground hover:bg-muted hover:text-foreground"><Mail className="size-4" /> メールテンプレート</Link>
            <Link href="/admin/settings" className="flex items-center gap-1.5 rounded-md px-2 py-1 text-muted-foreground hover:bg-muted hover:text-foreground"><Settings className="size-4" /> 料金・既定値</Link>
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="hidden text-muted-foreground sm:inline">{auth.user.email}</span>
            {tenant && <Link href="/" className="flex items-center gap-1 text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> アプリへ戻る</Link>}
            <form action={signOut}>
              <button type="submit" className="flex items-center gap-1 text-muted-foreground hover:text-foreground"><LogOut className="size-4" /> ログアウト</button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl p-4 md:p-6">{children}</main>
    </div>
  );
}
