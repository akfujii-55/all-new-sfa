"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signIn, type AuthState } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { LegalLinks } from "@/components/legal/legal-links";

const ERRORS: Record<string, string> = {
  invite: "招待リンクが無効か、有効期限が切れています。営業担当者ページから招待をもう一度送ってもらってください。",
  auth: "ログインリンクが無効です。もう一度ログインしてください。",
  recovery: "パスワード再設定のリンクが無効か、有効期限が切れています。もう一度お手続きください。",
};

export function LoginForm({ next, error, admin = false }: { next: string; error?: string | null; admin?: boolean }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(signIn, undefined);
  const linkError = error ? ERRORS[error] : null;

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        {admin && <p className="text-xs font-medium uppercase tracking-wider text-indigo-700 dark:text-indigo-300">Operator console</p>}
        <CardTitle>{admin ? "ART テナント管理画面" : "ログイン"}</CardTitle>
        <CardDescription>{admin ? "運営者のメールアドレスとパスワードを入力してください。利用者(テナント)のアカウントではログインできません。" : "メールアドレスとパスワードを入力してください"}</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="space-y-4">
          <input type="hidden" name="next" value={next} />
          <div className="space-y-2">
            <Label htmlFor="email">メールアドレス</Label>
            <Input id="email" name="email" type="email" autoComplete="email" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">パスワード</Label>
            <Input id="password" name="password" type="password" autoComplete="current-password" minLength={6} required />
          </div>
          {(state?.error || linkError) && (
            <Alert variant="destructive">
              <AlertDescription>{state?.error ?? linkError}</AlertDescription>
            </Alert>
          )}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "送信中..." : "ログイン"}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            <Link href="/forgot-password" className="underline">パスワードを忘れた方</Link>
          </p>
          {admin ? (
            <p className="text-center text-xs text-muted-foreground">
              利用者(テナント)の方は <Link href="/login" className="underline">こちらのログイン画面</Link> へ
            </p>
          ) : (
            <>
              <p className="text-center text-xs text-muted-foreground">
                アカウントは管理者からの招待メールで作成されます。
              </p>
              <p className="text-center text-xs text-muted-foreground">
                はじめてご利用の会社は <Link href="/signup" className="underline">無料で申し込む</Link>
              </p>
              <LegalLinks />
            </>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
