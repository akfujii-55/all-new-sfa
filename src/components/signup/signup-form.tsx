"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { MailCheck } from "lucide-react";
import { requestSignup, type SignupState } from "@/actions/signup";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { LegalLinks } from "@/components/legal/legal-links";

/** 会社名から会社 ID の候補を作る(英数字以外は落とす) */
function suggestSlug(name: string) {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export function SignupForm({ trialDays }: { trialDays: number }) {
  const [state, action, pending] = useActionState<SignupState, FormData>(requestSignup, undefined);
  const v = state && !state.ok ? state.values : {};
  const [slug, setSlug] = useState(v.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(Boolean(v.slug));

  if (state?.ok) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><MailCheck className="size-5 text-emerald-600" /> 確認メールを送りました</CardTitle>
          <CardDescription>{state.email} 宛に確認メールを送りました。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>メールに記載のリンクを開き、「アカウントを開設する」を押すとアカウントが作成され、パスワードの設定に進みます。</p>
          <p className="text-muted-foreground">メールが届かない場合は迷惑メールフォルダをご確認ください。リンクの有効期限は 24 時間です。</p>
          <p className="text-center pt-2"><Link href="/login" className="underline">ログイン画面へ</Link></p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>無料で申し込む</CardTitle>
        <CardDescription>{trialDays > 0 ? `${trialDays} 日間無料でお試しいただけます。お試し期間中はクレジットカードの登録は不要です。` : "入力後、確認メールをお送りします。"}</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="company_name">会社名</Label>
            <Input
              id="company_name" name="company_name" required maxLength={100} defaultValue={v.company_name}
              onChange={(e) => { if (!slugTouched) setSlug(suggestSlug(e.target.value)); }}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="slug">会社 ID</Label>
            <Input
              id="slug" name="slug" required value={slug} pattern="[a-z0-9][a-z0-9-]{1,38}[a-z0-9]" placeholder="example-co"
              onChange={(e) => { setSlugTouched(true); setSlug(e.target.value.toLowerCase()); }}
            />
            <p className="text-xs text-muted-foreground">英小文字・数字・ハイフンで 3〜40 文字。サポートへのお問い合わせ時に使います。後から変更できません。</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="contact_name">担当者名</Label>
            <Input id="contact_name" name="contact_name" required maxLength={60} autoComplete="name" defaultValue={v.contact_name} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">メールアドレス</Label>
            <Input id="email" name="email" type="email" required autoComplete="email" defaultValue={v.email} />
            <p className="text-xs text-muted-foreground">このアドレスがログイン ID になります。確認メールをお送りします。</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="contact_phone">電話番号(任意)</Label>
            <Input id="contact_phone" name="contact_phone" type="tel" autoComplete="tel" defaultValue={v.contact_phone} />
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="agree" className="mt-1" required />
            <span>
              <Link href="/legal/terms" className="underline" target="_blank">利用規約</Link>と
              <Link href="/legal/privacy" className="underline" target="_blank">プライバシーポリシー</Link>
              に同意します。お試し期間終了後にご利用を続けるにはお支払い方法の登録が必要で、登録がない場合はお試し期間の終了と同時にデータが削除されることを確認しました。
            </span>
          </label>
          {state && !state.ok && (
            <Alert variant="destructive"><AlertDescription>{state.error}</AlertDescription></Alert>
          )}
          <Button type="submit" className="w-full" disabled={pending}>{pending ? "送信中..." : "確認メールを送る"}</Button>
          <p className="text-center text-xs text-muted-foreground">
            すでにアカウントをお持ちの方は <Link href="/login" className="underline">ログイン</Link>
          </p>
          <LegalLinks />
        </form>
      </CardContent>
    </Card>
  );
}
