import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { createTenantClient, listActiveTenants } from "@/lib/supabase/tenant";
import { listMailAccounts } from "@/lib/mail/accounts";
import { verifyImap } from "@/lib/mail/sync";
import { verifySmtp } from "@/lib/mail/smtp";
import { errorMessage, errorDetail, logSystem } from "@/lib/log";

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

interface Check {
  name: string;
  ok: boolean;
  ms: number;
  error?: string;
}

/**
 * 稼働確認。
 * - 認証なし: DB に到達できるかだけを返す(UptimeRobot などの外形監視に使う)。
 * - cron(Authorization: Bearer <CRON_SECRET>)またはログイン済み: 各メールアカウントの IMAP / SMTP 接続も確認し、
 *   失敗は system_logs に記録して通知する。cron は有効な全テナント、ログイン済みは自テナントのアカウントが対象。
 * いずれかが失敗すると 503 を返す。
 */
export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  const fromCron = Boolean(secret && auth === `Bearer ${secret}`);
  // 接続確認の対象テナント(cron: 全テナント、ログイン済み: 自テナント)
  const tenants: { label: string; db: SupabaseClient }[] = [];
  if (!fromCron) {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    if (data.user) tenants.push({ label: "self", db: supabase });
  }
  const deep = fromCron || tenants.length > 0;

  const checks: Check[] = [];
  const admin = createAdminClient();

  const dbStart = Date.now();
  try {
    const { error } = await admin.from("tenants").select("id", { count: "exact", head: true });
    if (error) throw new Error(error.message);
    checks.push({ name: "database", ok: true, ms: Date.now() - dbStart });
  } catch (e) {
    checks.push({ name: "database", ok: false, ms: Date.now() - dbStart, error: errorMessage(e) });
    // DB に書けない可能性が高いので記録は試みるだけ
    await logSystem({ source: "health", message: `データベースに接続できません: ${errorMessage(e)}`, detail: errorDetail(e) }, admin);
    return NextResponse.json({ ok: false, checks, at: new Date().toISOString() }, { status: 503 });
  }

  if (deep) {
    if (fromCron) {
      try {
        for (const t of await listActiveTenants()) tenants.push({ label: t.slug, db: createTenantClient(t.id) });
      } catch (e) {
        checks.push({ name: "tenants", ok: false, ms: 0, error: errorMessage(e) });
        await logSystem({ source: "cron.health", message: `定期ヘルスチェックを開始できません: ${errorMessage(e)}`, detail: errorDetail(e) });
      }
    }
    for (const { label, db } of tenants) {
      const prefix = fromCron ? `${label}/` : "";
      let accounts: Awaited<ReturnType<typeof listMailAccounts>> = [];
      try {
        accounts = await listMailAccounts(db);
      } catch (e) {
        checks.push({ name: `${prefix}mail_accounts`, ok: false, ms: 0, error: errorMessage(e) });
      }
      for (const account of accounts) {
        for (const [kind, verify] of [["imap", verifyImap], ["smtp", verifySmtp]] as const) {
          const start = Date.now();
          try {
            await verify(account);
            checks.push({ name: `${prefix}${kind}:${account.email}`, ok: true, ms: Date.now() - start });
          } catch (e) {
            const error = errorMessage(e);
            checks.push({ name: `${prefix}${kind}:${account.email}`, ok: false, ms: Date.now() - start, error });
            await logSystem(
              {
                source: "health",
                message: `${kind.toUpperCase()} に接続できません(${account.email}): ${error}`,
                detail: { ...errorDetail(e), account: account.email, kind, fromCron },
              },
              db,
            );
          }
        }
      }
    }
    if (fromCron) {
      const failed = checks.filter((c) => !c.ok);
      // 全テナントをまとめた結果はシステム全体のログとして残す
      await logSystem({
        level: failed.length ? "warn" : "info",
        source: "cron.health",
        message: failed.length ? `定期ヘルスチェック: ${failed.length} 件の失敗(${failed.map((f) => f.name).join(", ")})` : "定期ヘルスチェック: すべて正常",
        detail: { checks },
      });
    }
  }

  const ok = checks.every((c) => c.ok);
  return NextResponse.json({ ok, deep, checks, at: new Date().toISOString() }, { status: ok ? 200 : 503 });
}
