/** 添付ファイルまわりでブラウザとサーバーの両方が使う定数・小さな関数(サーバー専用の処理は attachments.ts) */

export const ATTACHMENT_BUCKET = "email-attachments";

/** ブラウザから直接アップロードする一時置き場(テナント配下)。送信後に <tenant>/<email_id>/ へ移動する */
export const OUTBOX_PREFIX = "outbox";
/** 1通あたりの添付ファイル数の上限 */
export const MAX_ATTACHMENT_COUNT = 10;
/** 1通あたりの添付ファイル合計サイズの上限(Gmail の 25MB に対して余裕を持たせる) */
export const MAX_ATTACHMENT_TOTAL = 20 * 1024 * 1024;

/** アップロード済みの添付ファイルを指す情報(ブラウザ → Server Action に渡す) */
export interface OutgoingAttachmentRef {
  storagePath: string;
  filename: string;
  contentType: string;
  size: number;
}

export function extOf(filename: string) {
  const m = /\.([A-Za-z0-9]{1,10})$/.exec(filename);
  return m ? `.${m[1].toLowerCase()}` : "";
}

/** 送信用の Storage キーを作る(ファイル名に日本語などが含まれても安全) */
export function outboxPath(tenantId: string, batch: string, index: number, filename: string) {
  return `${tenantId}/${OUTBOX_PREFIX}/${batch}/${String(index + 1).padStart(2, "0")}${extOf(filename)}`;
}

export function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
