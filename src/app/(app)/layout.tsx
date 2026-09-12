import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Sidebar, MobileNav } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { SignatureProvider } from "@/components/mail/signature-provider";
import { buildSignature } from "@/lib/mail/signature";
import { getMailSettings } from "@/lib/settings";
import { getCurrentTenant } from "@/lib/supabase/tenant";
import { signOut } from "@/actions/auth";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");

  const [tenant, { data: profile }, { data: member }, mailSettings, { count: unread }, { count: inquiries }] = await Promise.all([
    getCurrentTenant(supabase),
    supabase.from("profiles").select("email, full_name").eq("id", auth.user.id).maybeSingle(),
    supabase.from("members").select("name").eq("profile_id", auth.user.id).maybeSingle(),
    getMailSettings(supabase),
    supabase.from("emails").select("id", { count: "exact", head: true }).eq("is_read", false).eq("direction", "inbound"),
    supabase.from("inquiries").select("id", { count: "exact", head: true }).eq("status", "new"),
  ]);

  // どの会社にも所属していないユーザー(招待を経ずに作られた等)にはデータを見せない
  if (!tenant) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="max-w-md space-y-4 text-center text-sm">
          <p className="font-medium">この利用者はどの会社(テナント)にも所属していません。</p>
          <p className="text-muted-foreground">会社の管理者から「営業担当者」ページの招待メールを送ってもらい、そのリンクからログインしてください。</p>
          <form action={signOut}><button type="submit" className="underline">ログアウト</button></form>
        </div>
      </div>
    );
  }

  // メール署名の担当者名: 営業担当者(members)の名前 → プロフィール名 → メールアドレスの @ より前
  const signature = buildSignature(mailSettings, member?.name || profile?.full_name || (auth.user.email ?? "").split("@")[0]);

  return (
    <SignatureProvider signature={signature} replySubject={mailSettings.reply_subject}>
      <div className="flex min-h-screen">
        <Sidebar counts={{ unread: unread ?? 0, inquiries: inquiries ?? 0 }} />
        <div className="flex-1 flex flex-col min-w-0">
          <Header user={{ email: profile?.email ?? auth.user.email ?? null, full_name: profile?.full_name ?? null }} tenantName={tenant.name} />
          <main className="flex-1 p-4 md:p-6 pb-20 md:pb-6">{children}</main>
        </div>
        <MobileNav />
      </div>
    </SignatureProvider>
  );
}
