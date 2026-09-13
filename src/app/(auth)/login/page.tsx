import { LoginForm } from "@/components/layout/login-form";

import Link from "next/link";
import { LEGAL_PAGES, OPERATOR } from "@/lib/legal";

export const metadata = { title: "ログイン" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : "/";
  const error = typeof sp.error === "string" ? sp.error : null;
  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="hidden lg:flex flex-col justify-between bg-zinc-950 text-white p-12">
        <div className="flex items-center gap-2 font-semibold text-lg">
          <span className="inline-flex size-8 items-center justify-center rounded-lg bg-white text-zinc-950 font-bold">S</span>
          SFA
        </div>
        <div className="space-y-4 max-w-md">
          <h1 className="text-3xl font-semibold leading-tight">メールから始まる、シンプルな営業管理。</h1>
          <p className="text-zinc-400">
            Gmail の問い合わせを自動で取り込み、顧客・案件・売上までひとつの流れで管理します。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-500">
          <span>© {new Date().getFullYear()} {OPERATOR.name}</span>
          {LEGAL_PAGES.map((p) => (
            <Link key={p.href} href={p.href} className="hover:text-zinc-300">{p.label}</Link>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-center p-6">
        <LoginForm next={next} error={error} />
      </div>
    </div>
  );
}
