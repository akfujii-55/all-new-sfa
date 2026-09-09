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
