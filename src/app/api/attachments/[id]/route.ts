import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { ATTACHMENT_BUCKET } from "@/lib/mail/attachments";

export const runtime = "nodejs";

/**
 * 添付ファイルのダウンロード。ログインユーザーのみ。
 * Storage の署名付き URL は日本語ファイル名が二重エンコードされるため、サーバー側で取得してそのまま返す。
 */
export async function GET(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: att } = await supabase
    .from("email_attachments")
    .select("filename, content_type, storage_path")
    .eq("id", id)
    .maybeSingle();
  if (!att) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { data, error } = await createAdminClient().storage.from(ATTACHMENT_BUCKET).download(att.storage_path);
  if (error || !data) return NextResponse.json({ error: error?.message ?? "failed" }, { status: 500 });

  // RFC 5987: ASCII のフォールバック名 + UTF-8 の本来の名前
  const ascii = att.filename.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "'");
  const utf8 = encodeURIComponent(att.filename);
  return new NextResponse(data.stream(), {
    headers: {
      "content-type": att.content_type || "application/octet-stream",
      "content-length": String(data.size),
      "content-disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${utf8}`,
      "cache-control": "private, no-store",
    },
  });
}
