import { NextResponse, type NextRequest } from "next/server";
import { runStepMails } from "@/lib/step-mails";
import { errorDetail, errorMessage, logSystem } from "@/lib/log";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * ステップメールの送信を手動で走らせる(CRON_SECRET の Bearer が必要)。
 * 通常は毎朝の同期 cron(/api/mail/sync)の最後で送るので、Vercel の cron には登録していない。
 * 送信時刻を変えたいときは vercel.json にこのパスを足す(Pro プラン)。
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
  try {
    const result = await runStepMails();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    await logSystem({ source: "cron.step_mails", message: `ステップメールの送信処理が中断しました: ${errorMessage(e)}`, detail: errorDetail(e), path: request.nextUrl.pathname });
    return NextResponse.json({ ok: false, error: errorMessage(e) }, { status: 500 });
  }
}
