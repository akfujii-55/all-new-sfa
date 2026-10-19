import type { MailCampaignRecipientStatus, MailCampaignStatus } from "@/lib/types";

/**
 * 一斉配信(0043)の、クライアント部品からも読む定義。サーバー専用のものを import しない(送信そのものは src/lib/mail/campaigns.ts)。
 */

/** 配信リストはテナントごと最大 50 */
export const MAX_MAILING_LISTS = 50;
/** 1 回の定期処理(5 分おき)で 1 つの配信から送る通数 */
export const CAMPAIGN_BATCH_SIZE = 30;
/** 配信停止リンクのパス(公開ページ。proxy の公開パスにも入れている) */
export const UNSUBSCRIBE_PATH = "/u";

export const CAMPAIGN_LIMITS = { subject: 200, body: 20000, listName: 50, listDescription: 500, footer: 1000 } as const;

export const CAMPAIGN_STATUS_LABEL: Record<MailCampaignStatus, string> = {
  draft: "下書き",
  scheduled: "予約",
  sending: "送信中",
  paused: "一時停止",
  done: "完了",
  cancelled: "取り消し",
};

export const RECIPIENT_STATUS_LABEL: Record<MailCampaignRecipientStatus, string> = {
  pending: "未送信",
  sent: "送信済み",
  failed: "失敗",
  skipped: "除外",
};

/** 配信の本文末尾に付く文(送信者情報 + 配信停止リンク)。編集はできない */
export function buildCampaignFooter(footer: string, unsubscribeUrl: string): string {
  return ["", "──", footer.trim(), "", "今後このご案内が不要な場合は、こちらから配信停止できます:", unsubscribeUrl].join("\n");
}

/** 配信停止ページの URL */
export function unsubscribeUrl(origin: string, token: string): string {
  return `${origin.replace(/\/$/, "")}${UNSUBSCRIBE_PATH}/${token}`;
}

/** 送信中の配信が終わるまでの目安(分)。5 分おきに CAMPAIGN_BATCH_SIZE 通ずつ */
export function estimateMinutes(remaining: number): number {
  if (remaining <= 0) return 0;
  return Math.max(5, Math.ceil(remaining / CAMPAIGN_BATCH_SIZE) * 5);
}
