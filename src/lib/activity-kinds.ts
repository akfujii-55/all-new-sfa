import { CalendarDays, ClipboardList, FileCheck, FileText, Handshake, Mail, MapPin, MessageSquare, Phone, PhoneIncoming, Presentation, Truck, Users, Video, type LucideIcon } from "lucide-react";

/**
 * 行動の種類(activity_kinds.icon)のアイコン。
 * 既定の 6 種類のキー(call/email/visit/quote/callback/other)は 0019 の固定キーと同じにしてある(0020 で移行に使った)。
 */
export const ACTIVITY_ICONS: { key: string; label: string; Icon: LucideIcon }[] = [
  { key: "call", label: "電話", Icon: Phone },
  { key: "callback", label: "折り返し", Icon: PhoneIncoming },
  { key: "email", label: "メール", Icon: Mail },
  { key: "chat", label: "チャット", Icon: MessageSquare },
  { key: "visit", label: "訪問", Icon: MapPin },
  { key: "meeting", label: "打ち合わせ", Icon: Users },
  { key: "web", label: "Web 会議", Icon: Video },
  { key: "presentation", label: "提案・デモ", Icon: Presentation },
  { key: "quote", label: "見積書", Icon: FileText },
  { key: "document", label: "契約・書類", Icon: FileCheck },
  { key: "delivery", label: "納品", Icon: Truck },
  { key: "handshake", label: "成約", Icon: Handshake },
  { key: "calendar", label: "予定", Icon: CalendarDays },
  { key: "other", label: "その他", Icon: ClipboardList },
];

/** 1 テナントあたりの行動の種類の上限 */
export const MAX_ACTIVITY_KINDS = 20;

export function activityIcon(key: string | null | undefined): LucideIcon {
  return (ACTIVITY_ICONS.find((i) => i.key === key) ?? ACTIVITY_ICONS[ACTIVITY_ICONS.length - 1]).Icon;
}
