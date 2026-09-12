import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createTenantClient, listActiveTenants } from "@/lib/supabase/tenant";
import { backfillAttachments, syncMail } from "@/lib/mail/sync";
import { errorDetail, errorMessage, logSystem } from "@/lib/log";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Gmail の IMAP 同期。
 * - cron から: Authorization: Bearer <CRON_SECRET>。有効な全テナントを順に同期する(テナント用クライアントで RLS を通す)
 * - ログインユーザーから: セッションクッキー。自テナントだけを同期する
 * ?backfill=<日数> を付けると、通常の同期の代わりに取り込み済みメールの添付ファイルを後追いで保存する
 */
export async function GET(request: NextRequest) {
  return handle(request);
}
export async function POST(request: NextRequest) {
  return handle(request);
}

async function handle(request: NextRequest) {
  const auth = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  const fromCron = Boolean(secret && auth === `Bearer ${secret}`);

  // 同期対象: cron なら全テナント、ログインユーザーなら自テナント
  const targets: { label: string; db: SupabaseClient }[] = [];
  if (fromCron) {
    try {
      for (const t of await listActiveTenants()) targets.push({ label: t.slug, db: createTenantClient(t.id) });
    } catch (e) {
      await logSystem({ source: "cron.sync", message: `定期同期を開始できません: ${errorMessage(e)}`, detail: errorDetail(e) });
      return NextResponse.json({ ok: false, error: errorMessage(e) }, { status: 500 });
    }
  } else {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    if (!data.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    targets.push({ label: "self", db: supabase });
  }

  const backfill = request.nextUrl.searchParams.get("backfill");
  const days = Number(request.nextUrl.searchParams.get("days") ?? 30);
  const out: Record<string, unknown>[] = [];
  let failed = 0;

  for (const { label, db } of targets) {
    try {
      if (backfill) {
        out.push({ tenant: label, results: await backfillAttachments(db, { days: Number(backfill) || 90 }) });
        continue;
      }
      const results = await syncMail(db, { initialDays: days });
      out.push({ tenant: label, results });
      if (fromCron) {
        const inserted = results.reduce((a, r) => a + r.inserted, 0);
        const errors = results.filter((r) => r.error).length;
        await logSystem(
          {
            level: errors ? "warn" : "info",
            source: "cron.sync",
            message: errors ? `定期同期: ${inserted} 件取り込み、${errors} 件のエラー` : `定期同期: ${inserted} 件取り込み`,
            detail: { results },
          },
          db,
        );
      }
    } catch (e) {
      failed++;
      out.push({ tenant: label, error: errorMessage(e) });
      await logSystem(
        {
          source: fromCron ? "cron.sync" : "mail.sync",
          message: `メール同期が中断しました: ${errorMessage(e)}`,
          detail: errorDetail(e),
          path: request.nextUrl.pathname,
        },
        db,
      );
    }
  }

  // ログインユーザーからの呼び出しは従来どおり単一の結果を返す
  if (!fromCron) {
    const only = out[0];
    if (only.error) return NextResponse.json({ ok: false, error: only.error }, { status: 500 });
    return NextResponse.json({ ok: true, results: only.results });
  }
  return NextResponse.json({ ok: failed === 0, tenants: out }, { status: failed === 0 ? 200 : 500 });
}
