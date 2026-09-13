"use client";

import { useActionState } from "react";
import Link from "next/link";
import { requestPasswordReset, type AuthState } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState<AuthState, FormData>(requestPasswordReset, undefined);
  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>パスワードの再設定</CardTitle>
        <CardDescription>登録しているメールアドレスを入力してください。再設定用のリンクをメールでお送りします。</CardDescription>
      </CardHeader>
      <CardContent>
        {state?.message ? (
          <div className="space-y-4">
            <Alert><AlertDescription>{state.message}</AlertDescription></Alert>
            <p className="text-center text-xs text-muted-foreground">
              <Link href="/login" className="underline">ログイン画面に戻る</Link>
            </p>
          </div>
        ) : (
          <form action={action} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">メールアドレス</Label>
              <Input id="email" name="email" type="email" autoComplete="email" required autoFocus />
            </div>
            {state?.error && (
              <Alert variant="destructive"><AlertDescription>{state.error}</AlertDescription></Alert>
            )}
            <Button type="submit" className="w-full" disabled={pending}>{pending ? "送信中..." : "再設定メールを送る"}</Button>
            <p className="text-center text-xs text-muted-foreground">
              <Link href="/login" className="underline">ログイン画面に戻る</Link>
            </p>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
