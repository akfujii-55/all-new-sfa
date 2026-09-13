import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SetPasswordForm } from "@/components/layout/set-password-form";

export const metadata = { title: "パスワード設定" };

export default async function SetPasswordPage({ searchParams }: PageProps<"/set-password">) {
  const sp = await searchParams;
  const reset = sp.mode === "reset";
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect(reset ? "/login?error=recovery" : "/login?error=invite");
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <SetPasswordForm email={data.user.email ?? ""} reset={reset} />
    </div>
  );
}
