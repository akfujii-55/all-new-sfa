"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { reportClientError } from "@/actions/settings";

/** ページ描画中のエラー画面。サーバー側で記録されていないブラウザ側のエラーはここから記録する */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const pathname = usePathname();
  useEffect(() => {
    reportClientError({ message: error.message, digest: error.digest ?? null, stack: error.stack ?? null, path: pathname }).catch(() => {});
  }, [error, pathname]);

  return (
    <div className="mx-auto max-w-lg py-16 text-center">
      <AlertTriangle className="mx-auto mb-3 size-8 text-destructive" />
      <h1 className="text-lg font-semibold">ページを表示できませんでした</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        エラーは記録されました。しばらくしてから再度お試しください。続く場合は設定の「システムログ」を確認してください。
      </p>
      {error.digest && <p className="mt-2 font-mono text-xs text-muted-foreground">ID: {error.digest}</p>}
      <div className="mt-4 flex justify-center gap-2">
        <Button onClick={reset}>もう一度読み込む</Button>
        <Button asChild variant="outline"><a href="/settings/logs">システムログ</a></Button>
      </div>
    </div>
  );
}
