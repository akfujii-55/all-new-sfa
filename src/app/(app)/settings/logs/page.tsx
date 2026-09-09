import Link from "next/link";
import { AlertTriangle, Info, ScrollText, XCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { DeleteOldLogsButton } from "@/components/settings/delete-old-logs-button";
import { fmtDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { SystemLog, SystemLogLevel } from "@/lib/types";

export const metadata = { title: "システムログ" };

const LEVELS: { key: SystemLogLevel | "all"; label: string }[] = [
  { key: "all", label: "すべて" },
  { key: "error", label: "エラー" },
  { key: "warn", label: "警告" },
  { key: "info", label: "情報" },
];

const LEVEL_STYLE: Record<SystemLogLevel, { label: string; className: string; Icon: typeof Info }> = {
  error: { label: "エラー", className: "bg-destructive/10 text-destructive border-destructive/30", Icon: XCircle },
  warn: { label: "警告", className: "bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-400", Icon: AlertTriangle },
  info: { label: "情報", className: "bg-muted text-muted-foreground", Icon: Info },
};

export default async function SystemLogsPage({ searchParams }: PageProps<"/settings/logs">) {
  const params = await searchParams;
  const level = (Array.isArray(params.level) ? params.level[0] : params.level) ?? "all";
  const supabase = await createClient();
  let q = supabase.from("system_logs").select("*").order("created_at", { ascending: false }).limit(200);
  if (level === "error" || level === "warn" || level === "info") q = q.eq("level", level);
  const { data, error } = await q;
  const logs = (data ?? []) as SystemLog[];

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="システムログ"
        description="メール送受信の失敗、定期処理の結果、ページのエラーなどサーバー側の記録(最新 200 件)"
        actions={
          <>
            <DeleteOldLogsButton />
            <Button asChild variant="ghost" size="sm"><Link href="/settings">設定へ戻る</Link></Button>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap gap-1">
        {LEVELS.map((l) => (
          <Button key={l.key} asChild size="sm" variant={level === l.key ? "default" : "outline"}>
            <Link href={l.key === "all" ? "/settings/logs" : `/settings/logs?level=${l.key}`}>{l.label}</Link>
          </Button>
        ))}
      </div>

      {error ? (
        <EmptyState
          icon={ScrollText}
          title="ログを読み込めませんでした"
          description={/system_logs/.test(error.message) || error.code === "PGRST205" ? "supabase/migrations/0006_system_logs.sql を適用してください" : error.message}
        />
      ) : logs.length === 0 ? (
        <EmptyState icon={ScrollText} title="記録はありません" description="エラーや定期処理の結果が発生するとここに表示されます" />
      ) : (
        <div className="divide-y rounded-lg border bg-card">
          {logs.map((log) => {
            const s = LEVEL_STYLE[log.level] ?? LEVEL_STYLE.info;
            return (
              <div key={log.id} className="p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className={cn("gap-1", s.className)}><s.Icon className="size-3" /> {s.label}</Badge>
                  <span className="font-mono text-xs text-muted-foreground">{log.source}</span>
                  <span className="text-xs text-muted-foreground">{fmtDateTime(log.created_at)}</span>
                  {log.notified && <Badge variant="secondary" className="text-xs">通知済み</Badge>}
                  {log.user_email && <span className="text-xs text-muted-foreground">{log.user_email}</span>}
                  {log.request_path && <span className="font-mono text-xs text-muted-foreground">{log.request_path}</span>}
                </div>
                <p className="mt-1 whitespace-pre-wrap break-words">{log.message}</p>
                {log.detail && (
                  <details className="mt-1">
                    <summary className="cursor-pointer text-xs text-muted-foreground">詳細</summary>
                    <pre className="mt-1 max-h-72 overflow-auto rounded bg-muted/50 p-2 text-xs">{JSON.stringify(log.detail, null, 2)}</pre>
                  </details>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
