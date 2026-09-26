import { NextResponse, type NextRequest } from "next/server";
import { createTenantClient, listActiveTenants } from "@/lib/supabase/tenant";
import { cleanupInboundMailbox } from "@/lib/mail/inbound";
import { purgeExpiredEmailTrash } from "@/lib/mail/trash";
import { runStepMails } from "@/lib/step-mails";
import { errorDetail, errorMessage, logSystem } from "@/lib/log";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * 1 日 1 回の定期処理(cron から Authorization: Bearer <CRON_SECRET>)。毎朝 7:00(JST)。
 * メールの取り込み(/api/mail/sync)は 5 分おきに動くので、毎回やる必要のない処理をここに分けている。
 * - 全テナントのゴミ箱の期限切れ(TRASH_RETENTION_DAYS 日超)を完全に削除
 * - ステップメール(お試し中の顧客への案内)の送信
 * - 転送メールの受信用メールボックスの掃除(宛先不明のメールを走査から外し、古いものを消す)
 * それぞれ失敗しても他の処理は続ける。
 */
export async function GET(request: NextRequest) {
  return handle(request);
}
export async function POST(request: NextRequest) {
  return handle(request);
}

async function handle(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const out: Record<string, unknown>[] = [];
  let failed = 0;

  try {
    for (const t of await listActiveTenants()) {
      const db = createTenantClient(t.id);
      try {
        const purged = await purgeExpiredEmailTrash(db);
        if (purged > 0) out.push({ tenant: t.slug, trash_purged: purged });
      } catch (e) {
        failed++;
        await logSystem({ source: "cron.maintenance", message: `ゴミ箱の完全削除に失敗: ${errorMessage(e)}`, detail: errorDetail(e) }, db);
      }
    }
  } catch (e) {
    failed++;
    await logSystem({ source: "cron.maintenance", message: `定期処理を開始できません: ${errorMessage(e)}`, detail: errorDetail(e) });
  }

  try {
    const r = await runStepMails();
    out.push({ step_mails: { sent: r.sent, failed: r.failed, skipped: r.skipped } });
  } catch (e) {
    failed++;
    await logSystem({ source: "cron.step_mails", message: `ステップメールの送信処理が中断しました: ${errorMessage(e)}`, detail: errorDetail(e) });
  }

  try {
    const cleaned = await cleanupInboundMailbox();
    if (cleaned) {
      out.push({ inbound: cleaned });
      if (cleaned.unknown > 0) {
        await logSystem({ level: "warn", source: "cron.maintenance", message: `転送メールの受け口に宛先不明のメールが ${cleaned.unknown} 件届きました`, detail: { ...cleaned }, notify: false });
      }
    }
  } catch (e) {
    failed++;
    await logSystem({ source: "cron.maintenance", message: `転送メールの受け口の掃除に失敗: ${errorMessage(e)}`, detail: errorDetail(e) });
  }

  await logSystem({ level: "info", source: "cron.maintenance", message: failed ? `毎朝の定期処理: ${failed} 件のエラー` : "毎朝の定期処理: 完了", detail: { results: out } });
  return NextResponse.json({ ok: failed === 0, results: out }, { status: failed === 0 ? 200 : 500 });
}
