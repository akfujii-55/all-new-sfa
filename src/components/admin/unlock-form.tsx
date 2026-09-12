"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { KeyRound } from "lucide-react";
import { unlockAdmin } from "@/actions/admin";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AdminUnlockForm({ hours }: { hours: number }) {
  const [pending, start] = useTransition();
  return (
    <div className="mx-auto mt-16 max-w-sm">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><KeyRound className="size-4" /> 運営管理のアクセスコード</CardTitle>
          <CardDescription>運営管理に入るには、通常のログインに加えてアクセスコードが必要です。解除は {hours} 時間有効です。</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-3"
            action={(fd) =>
              start(async () => {
                try {
                  await unlockAdmin(fd);
                } catch (e) {
                  toast.error((e as Error).message);
                }
              })
            }
          >
            <div className="grid gap-1.5">
              <Label htmlFor="code">アクセスコード</Label>
              <Input id="code" name="code" type="password" autoComplete="off" autoFocus required />
            </div>
            <Button type="submit" className="w-full" disabled={pending}>{pending ? "確認中..." : "解除する"}</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
