"use client";

import { useActionState, useState } from "react";
import { signIn, signUp, type AuthState } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function LoginForm({ next }: { next: string }) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [signInState, signInAction, signInPending] = useActionState<AuthState, FormData>(signIn, undefined);
  const [signUpState, signUpAction, signUpPending] = useActionState<AuthState, FormData>(signUp, undefined);
  const state = mode === "signin" ? signInState : signUpState;
  const pending = mode === "signin" ? signInPending : signUpPending;

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>{mode === "signin" ? "ログイン" : "アカウント作成"}</CardTitle>
        <CardDescription>
          {mode === "signin" ? "メールアドレスとパスワードを入力してください" : "社内メンバー用のアカウントを作成します"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={mode === "signin" ? signInAction : signUpAction} className="space-y-4">
          <input type="hidden" name="next" value={next} />
          {mode === "signup" && (
            <div className="space-y-2">
              <Label htmlFor="full_name">氏名</Label>
              <Input id="full_name" name="full_name" placeholder="山田 太郎" required />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">メールアドレス</Label>
            <Input id="email" name="email" type="email" autoComplete="email" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">パスワード</Label>
            <Input id="password" name="password" type="password" autoComplete="current-password" minLength={6} required />
          </div>
          {state?.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          {state?.message && (
            <Alert>
              <AlertDescription>{state.message}</AlertDescription>
            </Alert>
          )}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "送信中..." : mode === "signin" ? "ログイン" : "作成する"}
          </Button>
          <button
            type="button"
            className="w-full text-sm text-muted-foreground hover:text-foreground"
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          >
            {mode === "signin" ? "アカウントを作成する" : "ログインに戻る"}
          </button>
        </form>
      </CardContent>
    </Card>
  );
}
