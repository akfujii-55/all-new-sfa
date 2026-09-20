import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ADMIN_DOCS } from "@/content/admin-docs.generated";

/**
 * 運営者向けの文書(運営マニュアル・テスト仕様書)。運営者(operators)だけが開ける。
 * 本文は docs/admin/*.html。scripts/build-docs.mjs が完成した HTML を admin-docs.generated.ts に埋め込む
 * (public/ に置くと誰でも読めてしまうため)。Route Handler にはレイアウトの認証が効かないので、ここで確認する。
 */
export async function GET(request: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.redirect(new URL(`/login?next=/admin/docs/${encodeURIComponent(slug)}`, request.url));
  const { data: isOperator } = await supabase.rpc("is_operator");
  const doc = Object.hasOwn(ADMIN_DOCS, slug) ? ADMIN_DOCS[slug] : null;
  // 運営者でない人には、文書があるかどうかも教えない
  if (!isOperator || !doc) return new NextResponse("Not Found", { status: 404 });
  return new NextResponse(doc.html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
    },
  });
}
