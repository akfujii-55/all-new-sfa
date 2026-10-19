import type { NextConfig } from "next";

/** Supabase のホスト(ブラウザから Auth・PostgREST・Storage へ直接つなぐ)。CSP の connect-src に入れる */
const supabaseOrigin = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").origin;
  } catch {
    return "https://*.supabase.co";
  }
})();
const isDev = process.env.NODE_ENV !== "production";
const CSP = [
  "default-src 'self'",
  // Next.js のハイドレーション用インラインスクリプトのため 'unsafe-inline'。開発時の React Fast Refresh は eval を使う
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  // Tailwind / Radix のインラインスタイルと、文書(/docs、/admin/docs)が読む Google Fonts
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  // ブラウザから直接つなぐ先: 自サイト(Server Action)と Supabase(Auth・添付のアップロード)。開発時は HMR の WebSocket
  `connect-src 'self' ${supabaseOrigin} ${supabaseOrigin.replace(/^https/, "wss")}${isDev ? " ws://localhost:* http://localhost:*" : ""}`,
  "frame-ancestors 'none'",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");
const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: CSP },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  // 利用者向けの文書(/docs/*): public/docs/*.html を拡張子なしの URL で配り、検索エンジンには載せない(HTML の meta robots と二重に)。
  // 運営者向け(運営マニュアル・テスト仕様書)は public に置かず /admin/docs/<名前> で運営者にだけ配る
  async rewrites() {
    return [
      { source: "/docs", destination: "/docs/index.html" },
      { source: "/docs/manual", destination: "/docs/manual.html" },
      { source: "/docs/flow", destination: "/docs/flow.html" },
    ];
  },
  async redirects() {
    // テスト仕様書は運営者向けに移した(以前の URL からの案内)
    return [{ source: "/docs/test-spec", destination: "/admin/docs/test-spec", permanent: false }];
  },
  async headers() {
    return [
      { source: "/docs/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" }] },
      // セキュリティヘッダー(全ページ)。CSP は Next.js のインラインスクリプト・Tailwind のインラインスタイルが必要なので 'unsafe-inline' を許し、
      // 読み込み先のホストを絞ることで、万一のスクリプト混入時の外部送信と、他サイトへの埋め込み(クリックジャッキング)を防ぐ
      { source: "/(.*)", headers: SECURITY_HEADERS },
    ];
  },
};

export default nextConfig;
