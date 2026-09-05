import { format, formatDistanceToNow } from "date-fns";
import { ja } from "date-fns/locale";

export function yen(n: number | null | undefined) {
  return `¥${Math.round(Number(n ?? 0)).toLocaleString("ja-JP")}`;
}

export function fmtDate(d: string | Date | null | undefined, pattern = "yyyy/MM/dd") {
  if (!d) return "-";
  return format(new Date(d), pattern, { locale: ja });
}

export function fmtDateTime(d: string | Date | null | undefined) {
  return fmtDate(d, "yyyy/MM/dd HH:mm");
}

export function fmtRelative(d: string | Date | null | undefined) {
  if (!d) return "-";
  return formatDistanceToNow(new Date(d), { addSuffix: true, locale: ja });
}

export function fmtMonth(d: string | Date) {
  return format(new Date(d), "yyyy年M月", { locale: ja });
}

export function monthStart(d: Date = new Date()) {
  return format(new Date(d.getFullYear(), d.getMonth(), 1), "yyyy-MM-dd");
}

export function initials(name: string | null | undefined) {
  if (!name) return "?";
  return name.trim().slice(0, 1).toUpperCase();
}
