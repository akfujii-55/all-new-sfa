import { createElement } from "react";
import { activityIcon } from "@/lib/activity-kinds";

/** 行動の種類のアイコン(activity_kinds.icon のキーから。サーバーコンポーネントからも使える) */
export function ActivityKindIcon({ icon, className }: { icon: string | null | undefined; className?: string }) {
  return createElement(activityIcon(icon), { className });
}
