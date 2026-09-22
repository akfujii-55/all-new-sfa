import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/** LP 専用ドメイン(NEXT_PUBLIC_LP_HOST)。設定されていれば、そのドメインでは常に LP を表示し、本体(未ログインのトップ)からはそこへ送る */
const LP_HOST =
  (process.env.NEXT_PUBLIC_LP_HOST ?? "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "") || null;
/** 本体のオリジン。LP ドメインで /signup や /login を開いたときの飛び先 */
const APP_ORIGIN = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://sfa.art-trading.net").replace(/\/$/, "");

export async function updateSession(request: NextRequest) {
  // LP 専用ドメイン: / は LP、それ以外(申し込み・ログイン・法務ページなど)は本体ドメインへ送る。認証は見ない
  const host = (request.headers.get("host") ?? "").split(":")[0].toLowerCase();
  if (LP_HOST && host === LP_HOST) {
    const path = request.nextUrl.pathname;
    if (path === "/") return NextResponse.rewrite(new URL("/lp", request.url), { request });
    if (path === "/lp") return NextResponse.redirect(new URL("/", request.url), 308);
    return NextResponse.redirect(new URL(path + request.nextUrl.search, APP_ORIGIN), 307);
  }

  // 環境変数が未設定だと createServerClient が例外を投げて全ページが 500 になるため、原因が分かるメッセージを返す
  const missing = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"].filter((k) => !process.env[k]);
  if (missing.length > 0) {
    return new NextResponse(
      `環境変数が設定されていません: ${missing.join(", ")}\n` +
        "Vercel の場合は Project Settings → Environment Variables に .env.local と同じ値を登録し、再デプロイしてください。",
      { status: 500, headers: { "content-type": "text/plain; charset=utf-8" } },
    );
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublic =
    path.startsWith("/login") ||
    path.startsWith("/signup") ||
    path.startsWith("/forgot-password") ||
    path.startsWith("/legal") ||
    path.startsWith("/lp") ||
    path.startsWith("/docs") ||
    path.startsWith("/auth") ||
    path.startsWith("/api/mail") ||
    path.startsWith("/api/step-mails") ||
    path.startsWith("/api/stripe") ||
    path === "/api/health";

  // 未ログインでトップを開いたら紹介ページ(LP)へ。LP 専用ドメインがあればそこへ、無ければこのドメインで表示する(URL は / のまま)
  if (!user && path === "/") {
    if (LP_HOST) return NextResponse.redirect(`https://${LP_HOST}/`, 307);
    const url = request.nextUrl.clone();
    url.pathname = "/lp";
    return NextResponse.rewrite(url, { request });
  }
  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }
  if (user && path.startsWith("/login")) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
