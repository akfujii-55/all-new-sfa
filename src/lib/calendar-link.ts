import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";
import { APP_TZ } from "@/lib/format";
import type { DealActivity } from "@/lib/types";

/**
 * 行動(Todo)を Google カレンダーの「予定を作成」画面で開く URL。
 * 認証も API も使わず、リンクを開いた人が自分のカレンダーに保存する(1 件ずつ手動。変更は追従しない)。
 * 「時刻なし(終日)」は 23:59 で保存しているので終日の予定にし、時刻ありは 1 時間の予定にする。
 */
export function googleCalendarUrl(
  a: Pick<DealActivity, "body" | "due_at" | "kind">,
  deal: { id: string; title: string; company?: { name: string } | null } | null | undefined,
  origin: string,
): string | null {
  if (!a.due_at) return null;
  const start = new TZDate(new Date(a.due_at).getTime(), APP_TZ);
  const allDay = format(start, "HH:mm") === "23:59";
  const dates = allDay
    ? `${format(start, "yyyyMMdd")}/${format(new TZDate(start.getTime() + 24 * 60 * 60 * 1000, APP_TZ), "yyyyMMdd")}`
    : `${format(start, "yyyyMMdd'T'HHmmss")}/${format(new TZDate(start.getTime() + 60 * 60 * 1000, APP_TZ), "yyyyMMdd'T'HHmmss")}`;

  const kind = a.kind?.name ? `${a.kind.name}: ` : "";
  const title = deal ? `${kind}${a.body}(${deal.company?.name ? `${deal.company.name} / ` : ""}${deal.title})` : `${kind}${a.body}`;
  const lines = [a.body];
  if (deal) {
    lines.push("", `案件: ${deal.title}`);
    if (deal.company?.name) lines.push(`取引先: ${deal.company.name}`);
    lines.push(`${origin}/deals/${deal.id}`);
  }

  const params = new URLSearchParams({ action: "TEMPLATE", text: title.slice(0, 200), dates, details: lines.join("\n"), ctz: APP_TZ });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
