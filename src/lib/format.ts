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

/**
 * 行動の期限の表示。「時刻なし(終日)」は 23:59 で保存しているので、その場合は日付だけを出す。
 * (日付の選択部品 date-picker.tsx の ALL_DAY_TIME と対応)
 */
export function fmtDue(d: string | Date | null | undefined) {
  if (!d) return "-";
  return format(new Date(d), "HH:mm", inTz) === "23:59" ? fmtDate(d, "yyyy/MM/dd") : fmtDateTime(d);
}

export function fmtRelative(d: string | Date | null | undefined) {
  if (!d) return "-";
  return formatDistanceToNow(new Date(d), { addSuffix: true, locale: ja });
}

/**
 * メール一覧の日時。今日なら時刻だけ(10:32)、今年なら「9/23 18:12」、それ以前は年付き。
 * 並び順(新しい順)と実際の時刻を結び付けやすいよう、相対表示(3 時間前)は使わない。
 */
export function fmtMailTime(d: string | Date | null | undefined) {
  if (!d) return "-";
  const date = new Date(d);
  const now = nowInTz();
  if (format(date, "yyyy-MM-dd", inTz) === format(now, "yyyy-MM-dd", inTz)) return format(date, "HH:mm", inTz);
  if (format(date, "yyyy", inTz) === format(now, "yyyy", inTz)) return format(date, "M/d HH:mm", inTz);
  return format(date, "yyyy/M/d HH:mm", inTz);
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
