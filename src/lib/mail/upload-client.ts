"use client";

import { createClient } from "@/lib/supabase/client";
import { ATTACHMENT_BUCKET, MAX_ATTACHMENT_COUNT, MAX_ATTACHMENT_TOTAL, fmtBytes, outboxPath, type OutgoingAttachmentRef } from "@/lib/mail/attachment-shared";

/** 選んだファイルが上限内か確認する。問題があればメッセージを返す */
export function checkAttachmentLimits(files: File[]): string | null {
  if (files.length > MAX_ATTACHMENT_COUNT) return `添付ファイルは ${MAX_ATTACHMENT_COUNT} 件までです`;
  const total = files.reduce((n, f) => n + f.size, 0);
  if (total > MAX_ATTACHMENT_TOTAL) return `添付ファイルの合計は ${fmtBytes(MAX_ATTACHMENT_TOTAL)} までです(現在 ${fmtBytes(total)})`;
  return null;
}

/**
 * 添付ファイルをブラウザから Storage の outbox に直接アップロードする。
 * Server Action の本文サイズ制限(Vercel は 4.5MB)を避けるため、ファイル本体はサーバーを経由しない。
 */
export async function uploadAttachments(files: File[]): Promise<OutgoingAttachmentRef[]> {
  if (files.length === 0) return [];
  const supabase = createClient();
  // Storage のパスは <tenant_id>/outbox/... 。自テナント配下にしかアップロードできない(Storage のポリシー)
  const { data: tenantId, error: tenantErr } = await supabase.rpc("current_tenant_id");
  if (tenantErr || !tenantId) throw new Error("所属する会社(テナント)を確認できないため、添付ファイルをアップロードできません");
  const batch = crypto.randomUUID();
  const refs: OutgoingAttachmentRef[] = [];
  try {
    for (const [i, file] of files.entries()) {
      const storagePath = outboxPath(tenantId as string, batch, i, file.name);
      const contentType = file.type || "application/octet-stream";
      const { error } = await supabase.storage.from(ATTACHMENT_BUCKET).upload(storagePath, file, { contentType });
      if (error) throw new Error(`添付ファイルのアップロードに失敗しました(${file.name}): ${error.message}`);
      refs.push({ storagePath, filename: file.name, contentType, size: file.size });
    }
    return refs;
  } catch (e) {
    await discardUploads(refs);
    throw e;
  }
}

/** 送信に至らなかったアップロード済みファイルを消す(失敗しても無視) */
export async function discardUploads(refs: OutgoingAttachmentRef[]) {
  if (refs.length === 0) return;
  const supabase = createClient();
  await supabase.storage.from(ATTACHMENT_BUCKET).remove(refs.map((r) => r.storagePath)).catch(() => {});
}
