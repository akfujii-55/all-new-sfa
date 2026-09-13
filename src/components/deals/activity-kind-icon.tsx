import { ClipboardList, FileText, Mail, MapPin, Phone, PhoneIncoming } from "lucide-react";
import type { ActivityKind } from "@/lib/types";

const ICONS = { call: Phone, email: Mail, visit: MapPin, quote: FileText, callback: PhoneIncoming, other: ClipboardList } as const;

/** 行動の種類のアイコン(サーバーコンポーネントからも使える) */
export function ActivityKindIcon({ kind, className }: { kind: ActivityKind; className?: string }) {
  const Icon = ICONS[kind] ?? ClipboardList;
  return <Icon className={className} />;
}
