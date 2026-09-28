/**
 * 担当者へのお知らせ(0036)の種類とラベル。クライアント部品からも読むのでサーバー専用のものを import しない。
 */
export type NotificationKind = "inquiry_assigned" | "deal_assigned" | "activity_assigned";

export const NOTIFICATION_KIND_LABEL: Record<NotificationKind, string> = {
  inquiry_assigned: "問い合わせ",
  deal_assigned: "案件",
  activity_assigned: "行動",
};

/** ベルのドロップダウンに出す件数(既読も含めて新しい順) */
export const NOTIFICATION_LIST_LIMIT = 20;
