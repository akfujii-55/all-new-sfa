import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Sidebar, MobileNav } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { SignatureProvider } from "@/components/mail/signature-provider";
import { buildSignature } from "@/lib/mail/signature";
import { getMailSettings } from "@/lib/settings";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");

  const [{ data: profile }, { data: member }, mailSettings, { count: unread }, { count: inquiries }] = await Promise.all([
    supabase.from("profiles").select("email, full_name").eq("id", auth.user.id).maybeSingle(),
    supabase.from("members").select("name").eq("profile_id", auth.user.id).maybeSingle(),
    getMailSettings(supabase),
    supabase.from("emails").select("id", { count: "exact", head: true }).eq("is_read", false).eq("direction", "inbound"),
    supabase.from("inquiries").select("id", { count: "exact", head: true }).eq("status", "new"),
  ]);

  // メール署名の担当者名: 営業担当者(members)の名前 → プロフィール名 → メールアドレスの @ より前
  const signature = buildSignature(mailSettings, member?.name || profile?.full_name || (auth.user.email ?? "").split("@")[0]);

  return (
    <SignatureProvider signature={signature} replySubject={mailSettings.reply_subject}>
      <div className="flex min-h-screen">
        <Sidebar counts={{ unread: unread ?? 0, inquiries: inquiries ?? 0 }} />
        <div className="flex-1 flex flex-col min-w-0">
          <Header user={{ email: profile?.email ?? auth.user.email ?? null, full_name: profile?.full_name ?? null }} />
          <main className="flex-1 p-4 md:p-6 pb-20 md:pb-6">{children}</main>
        </div>
        <MobileNav />
      </div>
    </SignatureProvider>
  );
}
