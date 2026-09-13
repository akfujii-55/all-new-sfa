import { LoginForm } from "@/components/layout/login-form";

import Link from "next/link";
import { LEGAL_PAGES, OPERATOR } from "@/lib/legal";

/** /admin(運営管理)へ行こうとしてログインに来た場合は、利用者向けと区別した「ART テナント管理画面」の見た目にする */
function isAdminLogin(next: string) {
  return next === "/admin" || next.startsWith("/admin/");
}

export async function generateMetadata({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  return { title: isAdminLogin(typeof sp.next === "string" ? sp.next : "/") ? "ART テナント管理画面 ログイン" : "ログイン" };
}

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : "/";
  const error = typeof sp.error === "string" ? sp.error : null;
  const admin = isAdminLogin(next);
  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className={`hidden lg:flex flex-col justify-between p-12 text-white ${admin ? "bg-indigo-950" : "bg-zinc-950"}`}>
        <div className="flex items-center gap-2 font-semibold text-lg">
          <span className={`inline-flex size-8 items-center justify-center rounded-lg bg-white font-bold ${admin ? "text-indigo-950" : "text-zinc-950"}`}>S</span>
          {admin ? "SFA 運営管理" : "SFA"}
        </div>
        {admin ? (
          <div className="space-y-4 max-w-md">
            <p className="text-sm font-medium uppercase tracking-wider text-indigo-300">Operator console</p>
            <h1 className="text-3xl font-semibold leading-tight">ART テナント管理画面</h1>
            <p className="text-indigo-200">
              契約企業(テナント)の管理、料金設定、運営者の管理、メールテンプレートの編集を行う運営専用の画面です。運営者アカウントでログインしてください。
            </p>
          </div>
        ) : (
          <div className="space-y-4 max-w-md">
            <h1 className="text-3xl font-semibold leading-tight">メールから始まる、シンプルな営業管理。</h1>
            <p className="text-zinc-400">
              Gmail の問い合わせを自動で取り込み、顧客・案件・売上までひとつの流れで管理します。
            </p>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-500">
          <span>© {new Date().getFullYear()} {OPERATOR.name}</span>
          {LEGAL_PAGES.map((p) => (
            <Link key={p.href} href={p.href} className="hover:text-zinc-300">{p.label}</Link>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-center p-6">
        <LoginForm next={next} error={error} admin={admin} />
      </div>
    </div>
  );
}
