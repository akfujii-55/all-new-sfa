import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { backfillAttachments, syncMail } from "@/lib/mail/sync";
import { errorDetail, errorMessage, logSystem } from "@/lib/log";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Gmail の IMAP 同期。
 * - cron から: Authorization: Bearer <CRON_SECRET>
 * - ログインユーザーから: セッションクッキー
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
  let authorized = fromCron;

  if (!authorized) {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    authorized = Boolean(data.user);
  }
  if (!authorized) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const backfill = request.nextUrl.searchParams.get("backfill");
    if (backfill) {
      const results = await backfillAttachments(createAdminClient(), { days: Number(backfill) || 90 });
      return NextResponse.json({ ok: true, results });
    }
    const days = Number(request.nextUrl.searchParams.get("days") ?? 30);
    const admin = createAdminClient();
    const results = await syncMail(admin, { initialDays: days });
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
        admin,
      );
    }
    return NextResponse.json({ ok: true, results });
  } catch (e) {
    await logSystem({
      source: fromCron ? "cron.sync" : "mail.sync",
      message: `メール同期が中断しました: ${errorMessage(e)}`,
      detail: errorDetail(e),
      path: request.nextUrl.pathname,
    });
    return NextResponse.json({ ok: false, error: errorMessage(e) }, { status: 500 });
  }
}
