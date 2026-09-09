import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { backfillAttachments, syncMail } from "@/lib/mail/sync";

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
  let authorized = Boolean(secret && auth === `Bearer ${secret}`);

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
    const results = await syncMail(createAdminClient(), { initialDays: days });
    return NextResponse.json({ ok: true, results });
  } catch (e) {
    console.error("[mail/sync]", e);
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
