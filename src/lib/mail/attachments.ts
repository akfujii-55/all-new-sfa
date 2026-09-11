import type { SupabaseClient } from "@supabase/supabase-js";
import type { Attachment } from "mailparser";

export const ATTACHMENT_BUCKET = "email-attachments";

/** 受信メールの添付ファイルを Storage に保存し、email_attachments にメタ情報を登録する */
export async function saveAttachments(db: SupabaseClient, emailId: string, attachments: Attachment[]) {
  let saved = 0;
  for (const [i, a] of attachments.entries()) {
    if (!a.content || a.content.length === 0) continue;
    const filename = a.filename?.trim() || defaultName(i, a.contentType);
    // Storage のキーには日本語などを使わず、元のファイル名は DB に持つ
    const storagePath = `${emailId}/${String(i + 1).padStart(2, "0")}${extOf(filename)}`;
    const contentType = a.contentType || "application/octet-stream";

    const { error: upErr } = await db.storage
      .from(ATTACHMENT_BUCKET)
      .upload(storagePath, a.content, { contentType, upsert: true });
    if (upErr) throw new Error(`添付ファイルの保存に失敗しました(${filename}): ${upErr.message}`);

    const { error } = await db.from("email_attachments").insert({
      email_id: emailId,
      filename,
      content_type: contentType,
      size: a.size ?? a.content.length,
      storage_path: storagePath,
      content_id: a.cid ?? null,
      is_inline: a.contentDisposition === "inline" && Boolean(a.cid),
    });
    if (error) throw new Error(`添付ファイルの登録に失敗しました(${filename}): ${error.message}`);
    saved++;
  }
  return saved;
}

/** 指定メールに紐付く添付ファイルの実体を Storage から削除する(行は emails の削除で cascade される) */
export async function removeAttachmentObjects(db: SupabaseClient, emailIds: string[]) {
  if (emailIds.length === 0) return;
  const { data } = await db.from("email_attachments").select("storage_path").in("email_id", emailIds);
  const paths = (data ?? []).map((r) => r.storage_path as string);
  if (paths.length === 0) return;
  const { error } = await db.storage.from(ATTACHMENT_BUCKET).remove(paths);
  if (error) console.error("[attachments] remove failed", error.message);
}

function extOf(filename: string) {
  const m = /\.([A-Za-z0-9]{1,10})$/.exec(filename);
  return m ? `.${m[1].toLowerCase()}` : "";
}

function defaultName(i: number, contentType?: string) {
  const ext = contentType?.split("/")[1]?.replace(/[^a-z0-9]/gi, "");
  return `attachment-${i + 1}${ext ? `.${ext}` : ""}`;
}

export function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

// ---- 送信メールの添付 ----

/** ブラウザから直接アップロードする一時置き場の接頭辞(送信後に <email_id>/ へ移動する) */
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

const OUTBOX_PATH_RE = /^outbox\/[0-9a-f-]{36}\/\d{2}(\.[a-z0-9]{1,10})?$/;

/** 送信用の Storage キーを作る(ファイル名に日本語などが含まれても安全) */
export function outboxPath(batch: string, index: number, filename: string) {
  return `${OUTBOX_PREFIX}/${batch}/${String(index + 1).padStart(2, "0")}${extOf(filename)}`;
}

/** Server Action に渡された添付情報を検証する(パスの形式・件数・合計サイズ) */
export function validateOutgoingRefs(refs: OutgoingAttachmentRef[] | undefined): OutgoingAttachmentRef[] {
  const list = refs ?? [];
  if (list.length > MAX_ATTACHMENT_COUNT) throw new Error(`添付ファイルは ${MAX_ATTACHMENT_COUNT} 件までです`);
  let total = 0;
  for (const r of list) {
    if (!OUTBOX_PATH_RE.test(r.storagePath)) throw new Error("添付ファイルの指定が不正です");
    if (!r.filename?.trim()) throw new Error("添付ファイルの名前が不正です");
    total += Number(r.size) || 0;
  }
  if (total > MAX_ATTACHMENT_TOTAL) throw new Error(`添付ファイルの合計は ${fmtBytes(MAX_ATTACHMENT_TOTAL)} までです`);
  return list;
}

/** アップロード済みの添付ファイルを Storage から読み込み、SMTP 送信用の形にする */
export async function loadOutgoingAttachments(db: SupabaseClient, refs: OutgoingAttachmentRef[]) {
  const out: { filename: string; content: Buffer; contentType?: string }[] = [];
  for (const r of refs) {
    const { data, error } = await db.storage.from(ATTACHMENT_BUCKET).download(r.storagePath);
    if (error || !data) throw new Error(`添付ファイルを読み込めませんでした(${r.filename}): ${error?.message ?? "not found"}`);
    out.push({ filename: r.filename, content: Buffer.from(await data.arrayBuffer()), contentType: r.contentType || undefined });
  }
  return out;
}

/**
 * 送信済みメールの添付を outbox から <email_id>/ に移動し、email_attachments に登録する。
 * 失敗したファイルは呼び出し側で記録する(メール自体は送信・登録済みなので例外にはしない)。
 */
export async function attachOutgoing(db: SupabaseClient, emailId: string, refs: OutgoingAttachmentRef[]) {
  const failed: string[] = [];
  for (const [i, r] of refs.entries()) {
    const storagePath = `${emailId}/${String(i + 1).padStart(2, "0")}${extOf(r.filename)}`;
    const contentType = r.contentType || "application/octet-stream";
    const { error: mvErr } = await db.storage.from(ATTACHMENT_BUCKET).move(r.storagePath, storagePath);
    if (mvErr) {
      failed.push(`${r.filename}: ${mvErr.message}`);
      continue;
    }
    const { error } = await db.from("email_attachments").insert({
      email_id: emailId,
      filename: r.filename,
      content_type: contentType,
      size: r.size,
      storage_path: storagePath,
      content_id: null,
      is_inline: false,
    });
    if (error) failed.push(`${r.filename}: ${error.message}`);
  }
  return failed;
}

/** アップロードしたが送信に至らなかった添付ファイルを消す(失敗しても無視) */
export async function discardOutgoing(db: SupabaseClient, refs: OutgoingAttachmentRef[]) {
  const paths = refs.map((r) => r.storagePath).filter((p) => OUTBOX_PATH_RE.test(p));
  if (paths.length === 0) return;
  const { error } = await db.storage.from(ATTACHMENT_BUCKET).remove(paths);
  if (error) console.error("[attachments] discard failed", error.message);
}

/** 送信に至らずに残った outbox のファイル(1日以上前)を削除する。同期のついでに呼ぶ */
export async function cleanupOutbox(db: SupabaseClient, olderThanMs = 24 * 60 * 60 * 1000) {
  const { data: folders } = await db.storage.from(ATTACHMENT_BUCKET).list(OUTBOX_PREFIX, { limit: 1000 });
  const threshold = Date.now() - olderThanMs;
  const paths: string[] = [];
  for (const f of folders ?? []) {
    const { data: files } = await db.storage.from(ATTACHMENT_BUCKET).list(`${OUTBOX_PREFIX}/${f.name}`, { limit: 100 });
    for (const file of files ?? []) {
      const created = file.created_at ? Date.parse(file.created_at) : 0;
      if (created && created < threshold) paths.push(`${OUTBOX_PREFIX}/${f.name}/${file.name}`);
    }
  }
  if (paths.length === 0) return 0;
  const { error } = await db.storage.from(ATTACHMENT_BUCKET).remove(paths);
  if (error) console.error("[attachments] outbox cleanup failed", error.message);
  return error ? 0 : paths.length;
}
