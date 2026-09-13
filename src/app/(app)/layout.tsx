import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Sidebar, MobileNav } from "@/components/layout/sidebar";
import { nowIso } from "@/lib/activities";
import { Header } from "@/components/layout/header";
import { SignatureProvider } from "@/components/mail/signature-provider";
import { buildSignature } from "@/lib/mail/signature";
import { getMailSettings } from "@/lib/settings";
import { getCurrentTenant } from "@/lib/supabase/tenant";
import { signOut } from "@/actions/auth";
import { tenantAccess, trialDaysLeft as calcTrialDaysLeft } from "@/lib/tenant-quota";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");

  const [tenant, { data: isOperator }, { data: profile }, { data: member }, mailSettings, { count: unread }, { count: inquiries }, { count: overdue }] = await Promise.all([
    getCurrentTenant(supabase),
    supabase.rpc("is_operator"),
    supabase.from("profiles").select("email, full_name").eq("id", auth.user.id).maybeSingle(),
    supabase.from("members").select("name").eq("profile_id", auth.user.id).maybeSingle(),
    getMailSettings(supabase),
    supabase.from("emails").select("id", { count: "exact", head: true }).eq("is_read", false).eq("direction", "inbound"),
    supabase.from("inquiries").select("id", { count: "exact", head: true }).eq("status", "new"),
    supabase.from("deal_activities").select("id", { count: "exact", head: true }).is("done_at", null).lt("due_at", nowIso()),
  ]);

  // 運営専用アカウント(テナントに所属しない運営者)は運営管理へ
  if (!tenant && isOperator) redirect("/admin");
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
  // 停止中・解約・お試し期限切れは閲覧のみ(書き込み系の Server Action は個別に拒否する)
  const access = tenantAccess(tenant);
  // お試し終了が近く、まだお支払い方法が未登録なら知らせる(7 日前から)
  const trialDaysLeft = calcTrialDaysLeft(tenant);
  const trialEndingSoon = access.writable && !tenant.stripe_subscription_id && trialDaysLeft !== null && trialDaysLeft <= 7;

  return (
    <SignatureProvider signature={signature} replySubject={mailSettings.reply_subject}>
      <div className="flex min-h-screen">
        <Sidebar counts={{ unread: unread ?? 0, inquiries: inquiries ?? 0, overdue: overdue ?? 0 }} isOperator={Boolean(isOperator)} />
        <div className="flex-1 flex flex-col min-w-0">
          <Header user={{ email: profile?.email ?? auth.user.email ?? null, full_name: profile?.full_name ?? null }} tenantName={tenant.name} />
          {!access.writable && (
            <div className="border-b border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100 md:px-6">
              {access.reason} 現在は閲覧のみ可能です。
              {tenant.status !== "suspended" && <Link href="/settings/billing" className="ml-2 underline">ご契約・お支払いへ</Link>}
            </div>
          )}
          {trialEndingSoon && (
            <div className="border-b border-sky-300 bg-sky-50 px-4 py-2 text-sm text-sky-900 dark:border-sky-700 dark:bg-sky-950 dark:text-sky-100 md:px-6">
              お試し期間は{trialDaysLeft! <= 0 ? "本日" : `あと ${trialDaysLeft} 日`}で終了します。引き続き利用するには
              <Link href="/settings/billing" className="mx-1 underline">ご契約・お支払い</Link>からお支払い方法を登録してください。
            </div>
          )}
          <main className="flex-1 p-4 md:p-6 pb-20 md:pb-6">{children}</main>
        </div>
        <MobileNav />
      </div>
    </SignatureProvider>
  );
}
