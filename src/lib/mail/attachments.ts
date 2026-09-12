import type { SupabaseClient } from "@supabase/supabase-js";
import type { Attachment } from "mailparser";
import { createAdminClient } from "@/lib/supabase/server";
import { tenantIdOf } from "@/lib/supabase/tenant";
import { ATTACHMENT_BUCKET, MAX_ATTACHMENT_COUNT, MAX_ATTACHMENT_TOTAL, OUTBOX_PREFIX, extOf, fmtBytes, type OutgoingAttachmentRef } from "./attachment-shared";

export { ATTACHMENT_BUCKET, MAX_ATTACHMENT_COUNT, MAX_ATTACHMENT_TOTAL, OUTBOX_PREFIX, fmtBytes, outboxPath, type OutgoingAttachmentRef } from "./attachment-shared";

/**
 * Storage のパスはすべて <tenant_id>/ で始める(受信: <tenant>/<email_id>/NN.ext、送信前: <tenant>/outbox/<batch>/NN.ext)。
 * 表(email_attachments)の読み書きは呼び出し側のクライアント(RLS でテナントに絞られる)で行い、
 * 実体の読み書きはサーバー側の service role で行う。ブラウザからは outbox へのアップロード・削除だけ許可している。
 */
function storage() {
  return createAdminClient().storage.from(ATTACHMENT_BUCKET);
}

/** 受信メールの添付ファイルを Storage に保存し、email_attachments にメタ情報を登録する */
export async function saveAttachments(db: SupabaseClient, emailId: string, attachments: Attachment[]) {
  const tenantId = await tenantIdOf(db);
  let saved = 0;
  for (const [i, a] of attachments.entries()) {
    if (!a.content || a.content.length === 0) continue;
    const filename = a.filename?.trim() || defaultName(i, a.contentType);
    // Storage のキーには日本語などを使わず、元のファイル名は DB に持つ
    const storagePath = `${tenantId}/${emailId}/${String(i + 1).padStart(2, "0")}${extOf(filename)}`;
    const contentType = a.contentType || "application/octet-stream";

    const { error: upErr } = await storage().upload(storagePath, a.content, { contentType, upsert: true });
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

/** 添付ファイルの実体を取得する(行は呼び出し側で RLS 越しに確認済みのこと) */
export async function downloadAttachment(storagePath: string) {
  return storage().download(storagePath);
}

/** 指定メールに紐付く添付ファイルの実体を Storage から削除する(行は emails の削除で cascade される) */
export async function removeAttachmentObjects(db: SupabaseClient, emailIds: string[]) {
  if (emailIds.length === 0) return;
  const { data } = await db.from("email_attachments").select("storage_path").in("email_id", emailIds);
  const paths = (data ?? []).map((r) => r.storage_path as string);
  if (paths.length === 0) return;
  const { error } = await storage().remove(paths);
  if (error) console.error("[attachments] remove failed", error.message);
}

function defaultName(i: number, contentType?: string) {
  const ext = contentType?.split("/")[1]?.replace(/[^a-z0-9]/gi, "");
  return `attachment-${i + 1}${ext ? `.${ext}` : ""}`;
}

// ---- 送信メールの添付 ----

const OUTBOX_PATH_RE = /^([0-9a-f-]{36})\/outbox\/[0-9a-f-]{36}\/\d{2}(\.[a-z0-9]{1,10})?$/;

/** Server Action に渡された添付情報を検証する(パスの形式・自テナント配下か・件数・合計サイズ) */
export function validateOutgoingRefs(refs: OutgoingAttachmentRef[] | undefined, tenantId: string): OutgoingAttachmentRef[] {
  const list = refs ?? [];
  if (list.length > MAX_ATTACHMENT_COUNT) throw new Error(`添付ファイルは ${MAX_ATTACHMENT_COUNT} 件までです`);
  let total = 0;
  for (const r of list) {
    const m = OUTBOX_PATH_RE.exec(r.storagePath);
    if (!m || m[1] !== tenantId) throw new Error("添付ファイルの指定が不正です");
    if (!r.filename?.trim()) throw new Error("添付ファイルの名前が不正です");
    total += Number(r.size) || 0;
  }
  if (total > MAX_ATTACHMENT_TOTAL) throw new Error(`添付ファイルの合計は ${fmtBytes(MAX_ATTACHMENT_TOTAL)} までです`);
  return list;
}

/** アップロード済みの添付ファイルを Storage から読み込み、SMTP 送信用の形にする(refs は validateOutgoingRefs 済みのこと) */
export async function loadOutgoingAttachments(refs: OutgoingAttachmentRef[]) {
  const out: { filename: string; content: Buffer; contentType?: string }[] = [];
  for (const r of refs) {
    const { data, error } = await storage().download(r.storagePath);
    if (error || !data) throw new Error(`添付ファイルを読み込めませんでした(${r.filename}): ${error?.message ?? "not found"}`);
    out.push({ filename: r.filename, content: Buffer.from(await data.arrayBuffer()), contentType: r.contentType || undefined });
  }
  return out;
}

/**
 * 送信済みメールの添付を outbox から <tenant>/<email_id>/ に移動し、email_attachments に登録する。
 * 失敗したファイルは呼び出し側で記録する(メール自体は送信・登録済みなので例外にはしない)。
 */
export async function attachOutgoing(db: SupabaseClient, emailId: string, refs: OutgoingAttachmentRef[]) {
  const tenantId = await tenantIdOf(db);
  const failed: string[] = [];
  for (const [i, r] of refs.entries()) {
    const storagePath = `${tenantId}/${emailId}/${String(i + 1).padStart(2, "0")}${extOf(r.filename)}`;
    const contentType = r.contentType || "application/octet-stream";
    const { error: mvErr } = await storage().move(r.storagePath, storagePath);
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

/** アップロードしたが送信に至らなかった添付ファイルを消す(失敗しても無視。refs は validateOutgoingRefs 済みのこと) */
export async function discardOutgoing(refs: OutgoingAttachmentRef[]) {
  const paths = refs.map((r) => r.storagePath).filter((p) => OUTBOX_PATH_RE.test(p));
  if (paths.length === 0) return;
  const { error } = await storage().remove(paths);
  if (error) console.error("[attachments] discard failed", error.message);
}

/** 送信に至らずに残った自テナントの outbox のファイル(1日以上前)を削除する。同期のついでに呼ぶ */
export async function cleanupOutbox(db: SupabaseClient, olderThanMs = 24 * 60 * 60 * 1000) {
  const tenantId = await tenantIdOf(db);
  const base = `${tenantId}/${OUTBOX_PREFIX}`;
  const { data: folders } = await storage().list(base, { limit: 1000 });
  const threshold = Date.now() - olderThanMs;
  const paths: string[] = [];
  for (const f of folders ?? []) {
    const { data: files } = await storage().list(`${base}/${f.name}`, { limit: 100 });
    for (const file of files ?? []) {
      const created = file.created_at ? Date.parse(file.created_at) : 0;
      if (created && created < threshold) paths.push(`${base}/${f.name}/${file.name}`);
    }
  }
  if (paths.length === 0) return 0;
  const { error } = await storage().remove(paths);
  if (error) console.error("[attachments] outbox cleanup failed", error.message);
  return error ? 0 : paths.length;
}
