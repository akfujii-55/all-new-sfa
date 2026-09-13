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

export function LoginForm({ next, error }: { next: string; error?: string | null }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(signIn, undefined);
  const linkError = error ? ERRORS[error] : null;

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>ログイン</CardTitle>
        <CardDescription>メールアドレスとパスワードを入力してください</CardDescription>
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
          <p className="text-center text-xs text-muted-foreground">
            アカウントは管理者からの招待メールで作成されます。
          </p>
          <p className="text-center text-xs text-muted-foreground">
            はじめてご利用の会社は <Link href="/signup" className="underline">無料で申し込む</Link>
          </p>
          <LegalLinks />
        </form>
      </CardContent>
    </Card>
  );
}
