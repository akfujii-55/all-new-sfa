"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { createTenant, type CreateTenantResult } from "@/actions/admin";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { PricingSettings } from "@/lib/pricing";

export function TenantCreateForm({ pricing }: { pricing: PricingSettings }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<CreateTenantResult | null>(null);
  const [slug, setSlug] = useState("");

  if (result) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-base">テナントを作成しました</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          {result.mailSent ? (
            <p>担当者へ招待メールを送りました。リンクの有効期限は 24 時間です。</p>
          ) : (
            <p className="text-destructive">招待メールを送れませんでした({result.mailError})。以下のリンクを担当者へ送ってください。</p>
          )}
          <div className="rounded-md border bg-muted p-2 break-all font-mono text-xs">{result.inviteLink}</div>
          <div className="flex gap-2">
            <Button asChild size="sm"><Link href={`/admin/tenants/${result.id}`}>テナントの詳細へ</Link></Button>
            <Button asChild size="sm" variant="outline"><Link href="/admin">一覧へ戻る</Link></Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <form
      className="space-y-6"
      action={(fd) =>
        start(async () => {
          try {
            setResult(await createTenant(fd));
            toast.success("テナントを作成しました");
          } catch (e) {
            toast.error((e as Error).message);
          }
        })
      }
    >
      <Card>
        <CardHeader><CardTitle className="text-base">会社</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="name">会社名 *</Label>
            <Input id="name" name="name" required />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="slug">会社 ID *</Label>
            <Input id="slug" name="slug" value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} placeholder="sample-co" pattern="[a-z0-9][a-z0-9-]{1,38}[a-z0-9]" required />
            <p className="text-xs text-muted-foreground">英小文字・数字・ハイフン、3〜40 文字。後から変更できません。</p>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="contact_phone">電話</Label>
            <Input id="contact_phone" name="contact_phone" />
          </div>
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="address">住所</Label>
            <Input id="address" name="address" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">最初の管理者(招待先)</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="contact_name">担当者名 *</Label>
            <Input id="contact_name" name="contact_name" required />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="contact_email">メールアドレス *</Label>
            <Input id="contact_email" name="contact_email" type="email" required />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">上限・お試し期間</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-4">
          <div className="grid gap-1.5">
            <Label htmlFor="max_users">ユーザー数</Label>
            <Input id="max_users" name="max_users" type="number" min={1} defaultValue={pricing.default_max_users} required />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="max_mail_accounts">メールアカウント数</Label>
            <Input id="max_mail_accounts" name="max_mail_accounts" type="number" min={1} defaultValue={pricing.default_max_mail_accounts} required />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="max_storage_gb">容量(GB)</Label>
            <Input id="max_storage_gb" name="max_storage_gb" type="number" min={0.1} step={0.1} defaultValue={pricing.default_max_storage_gb} required />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="trial_days">お試し期間(日)</Label>
            <Input id="trial_days" name="trial_days" type="number" min={0} defaultValue={pricing.trial_days} required />
          </div>
          <div className="grid gap-1.5 sm:col-span-4">
            <Label htmlFor="note">運営メモ</Label>
            <Textarea id="note" name="note" rows={2} placeholder="申込経緯、担当営業、特記事項など" />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button asChild type="button" variant="outline"><Link href="/admin">キャンセル</Link></Button>
        <Button type="submit" disabled={pending}>{pending ? "作成中..." : "作成して招待メールを送る"}</Button>
      </div>
    </form>
  );
}
