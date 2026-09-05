import { LoginForm } from "@/components/layout/login-form";

export const metadata = { title: "ログイン" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : "/";
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
        <p className="text-xs text-zinc-500">© {new Date().getFullYear()} SFA</p>
      </div>
      <div className="flex items-center justify-center p-6">
        <LoginForm next={next} />
      </div>
    </div>
  );
}
