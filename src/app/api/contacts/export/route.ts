import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { tagsFromRows } from "@/lib/tags";
import { ilikePattern } from "@/lib/search-filter";
import type { Contact, Tag } from "@/lib/types";

export const runtime = "nodejs";

/**
 * 担当者の送信リストを CSV でダウンロードする(ログインユーザーのみ、自テナント分)。
 * ?tag=<tag_id> でタグ絞り込み、?q= で氏名・メール・役職の検索を引き継ぐ。
 * Excel でそのまま開けるように UTF-8 BOM 付き。
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const tag = request.nextUrl.searchParams.get("tag");
  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  let query = supabase
    .from("contacts")
    .select(`*, company:companies(id,name), tags:contact_tags(tag:tags(id,name,color,sort_order,created_at))${tag ? ", filter_tags:contact_tags!inner(tag_id)" : ""}`)
    .order("name");
  if (tag) query = query.eq("filter_tags.tag_id", tag);
  // 検索語はフィルタ構文(カンマ・括弧)を含んでも壊れないよう引用する
  if (q) query = query.or(`name.ilike.${ilikePattern(q)},email.ilike.${ilikePattern(q)},title.ilike.${ilikePattern(q)}`);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: "CSV を作成できませんでした" }, { status: 500 });

  const rows = (data ?? []) as unknown as (Contact & { tags: { tag: Tag | Tag[] | null }[] })[];
  // 氏名・役職などは受信メールから自動で入る(外部の差出人が決められる)値なので、
  // Excel が数式として評価する先頭文字(= + - @ タブ 改行)はシングルクォートを前置して文字列にする(CSV インジェクション対策)
  const esc = (v: string | null | undefined) => {
    let s = String(v ?? "").replace(/[\r\n]+/g, " ");
    if (/^[=+\-@\t]/.test(s)) s = `'${s}`;
    return `"${s.replace(/"/g, '""')}"`;
  };
  const lines = [["氏名", "メールアドレス", "会社", "役職", "電話", "タグ"].map(esc).join(",")];
  for (const c of rows) {
    lines.push([c.name, c.email, c.company?.name ?? "", c.title, c.phone, tagsFromRows(c.tags).map((t) => t.name).join(" / ")].map(esc).join(","));
  }
  const csv = "﻿" + lines.join("\r\n") + "\r\n";
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  let tagName = "";
  if (tag) {
    const { data: t } = await supabase.from("tags").select("name").eq("id", tag).maybeSingle();
    tagName = t?.name ? `_${t.name}` : "";
  }
  const filename = `contacts${tagName}_${stamp}.csv`;
  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename.replace(/[^\x20-\x7e]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "cache-control": "private, no-store",
    },
  });
}
