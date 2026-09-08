import { format, formatDistanceToNow, startOfMonth } from "date-fns";
import { ja } from "date-fns/locale";
import { tz, TZDate } from "@date-fns/tz";

/**
 * 表示用のタイムゾーン。
 * サーバーコンポーネントは Vercel 上では UTC で動くため、`format` にそのまま渡すと
 * 日本時間より 9 時間ずれて表示される。日付・時刻の整形は必ずこのタイムゾーンで行う。
 */
export const APP_TZ = "Asia/Tokyo";
const inTz = { in: tz(APP_TZ) };

/** 日本時間での「今」 */
export function nowInTz() {
  return TZDate.tz(APP_TZ);
}

export function yen(n: number | null | undefined) {
  return `¥${Math.round(Number(n ?? 0)).toLocaleString("ja-JP")}`;
}

export function fmtDate(d: string | Date | null | undefined, pattern = "yyyy/MM/dd") {
  if (!d) return "-";
  return format(new Date(d), pattern, { locale: ja, ...inTz });
}

export function fmtDateTime(d: string | Date | null | undefined) {
  return fmtDate(d, "yyyy/MM/dd HH:mm");
}

export function fmtRelative(d: string | Date | null | undefined) {
  if (!d) return "-";
  return formatDistanceToNow(new Date(d), { addSuffix: true, locale: ja });
}

export function fmtMonth(d: string | Date) {
  return format(new Date(d), "yyyy年M月", { locale: ja, ...inTz });
}

/** 日本時間での月初(yyyy-MM-dd)。引数省略時は今月 */
export function monthStart(d: Date = nowInTz()) {
  return format(startOfMonth(d, inTz), "yyyy-MM-dd", inTz);
}

/**
 * `<input type="datetime-local">` の値("yyyy-MM-ddTHH:mm")を日本時間として解釈し、ISO 文字列にする。
 * サーバーで `new Date(str)` すると UTC として解釈されてしまうため使わないこと。
 */
export function parseLocalInput(v: string | null | undefined): string | null {
  const m = (v ?? "").trim().match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m.map(Number);
  return new TZDate(y, mo - 1, d, h, mi, APP_TZ).toISOString();
}

/** ISO 文字列を `<input type="datetime-local">` の初期値(日本時間)にする */
export function toLocalInput(iso: string | null | undefined) {
  if (!iso) return "";
  return format(new Date(iso), "yyyy-MM-dd'T'HH:mm", inTz);
}

export function initials(name: string | null | undefined) {
  if (!name) return "?";
  return name.trim().slice(0, 1).toUpperCase();
}
