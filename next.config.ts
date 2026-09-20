import type { NextConfig } from "next";

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
    return [{ source: "/docs/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" }] }];
  },
};

export default nextConfig;
