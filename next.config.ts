import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 文書(/docs/*): public/docs/*.html を拡張子なしの URL で配り、検索エンジンには載せない(HTML の meta robots と二重に)
  async rewrites() {
    return [
      { source: "/docs", destination: "/docs/index.html" },
      { source: "/docs/manual", destination: "/docs/manual.html" },
      { source: "/docs/test-spec", destination: "/docs/test-spec.html" },
    ];
  },
  async headers() {
    return [{ source: "/docs/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" }] }];
  },
};

export default nextConfig;
