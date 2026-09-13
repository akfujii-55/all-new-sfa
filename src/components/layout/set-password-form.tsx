"use client";

import { useActionState } from "react";
import { setPassword, type AuthState } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function SetPasswordForm({ email, reset = false }: { email: string; reset?: boolean }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(setPassword, undefined);
  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>{reset ? "新しいパスワードを設定" : "パスワードを設定"}</CardTitle>
        <CardDescription>{reset ? `${email} の新しいパスワードを入力してください。` : `${email} でログインするためのパスワードを決めてください。`}</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="password">パスワード(8文字以上)</Label>
            <Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required autoFocus />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm">パスワード(確認)</Label>
            <Input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={8} required />
          </div>
          {state?.error && (
            <Alert variant="destructive"><AlertDescription>{state.error}</AlertDescription></Alert>
          )}
          <Button type="submit" className="w-full" disabled={pending}>{pending ? "保存中..." : reset ? "パスワードを変更する" : "設定してはじめる"}</Button>
        </form>
      </CardContent>
    </Card>
  );
}
