import Link from "next/link";
import { findPendingSignup } from "@/actions/signup";
import { CompleteSignupButton } from "@/components/signup/complete-signup-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtDateTime } from "@/lib/format";

export const metadata = { title: "アカウントの開設" };
export const dynamic = "force-dynamic";

export default async function SignupVerifyPage({ searchParams }: PageProps<"/signup/verify">) {
  const sp = await searchParams;
  const token = typeof sp.token === "string" ? sp.token : null;
  const req = await findPendingSignup(token);

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      {req ? (
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>アカウントを開設します</CardTitle>
            <CardDescription>内容を確認して「アカウントを開設する」を押してください。続けてパスワードの設定に進みます。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <dl className="grid grid-cols-[6rem_1fr] gap-y-1.5">
              <dt className="text-muted-foreground">会社名</dt><dd>{req.company_name}</dd>
              <dt className="text-muted-foreground">会社 ID</dt><dd><code className="rounded bg-muted px-1">{req.slug}</code></dd>
              <dt className="text-muted-foreground">担当者</dt><dd>{req.contact_name}</dd>
              <dt className="text-muted-foreground">メール</dt><dd>{req.email}</dd>
            </dl>
            <CompleteSignupButton token={token!} />
            <p className="text-xs text-muted-foreground">このリンクの有効期限: {fmtDateTime(req.expires_at)}</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>リンクが無効です</CardTitle>
            <CardDescription>このリンクは有効期限が切れているか、既に使われています。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>アカウントを開設済みの場合は <Link href="/login" className="underline">ログイン</Link> してください。</p>
            <p>まだの場合は <Link href="/signup" className="underline">もう一度お申し込み</Link> ください。</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
