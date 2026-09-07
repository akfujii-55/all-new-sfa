import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SetPasswordForm } from "@/components/layout/set-password-form";

export const metadata = { title: "パスワード設定" };

export default async function SetPasswordPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login?error=invite");
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <SetPasswordForm email={data.user.email ?? ""} />
    </div>
  );
}
