// Supabase の認証設定を社内利用向けにする(自己登録を止め、サイト URL を設定する)
// 使い方: SUPABASE_ACCESS_TOKEN=sbp_xxx SUPABASE_PROJECT_REF=xxxx SITE_URL=https://example.vercel.app node scripts/configure-supabase-auth.mjs
import { readFileSync } from "node:fs";
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}
const token = process.env.SUPABASE_ACCESS_TOKEN;
const ref = process.env.SUPABASE_PROJECT_REF;
const siteUrl = (process.env.SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
if (!token || !ref || !siteUrl) {
  console.error("SUPABASE_ACCESS_TOKEN / SUPABASE_PROJECT_REF / SITE_URL(または NEXT_PUBLIC_SITE_URL)を設定してください");
  process.exit(1);
}
const url = `https://api.supabase.com/v1/projects/${ref}/config/auth`;
const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
const before = await (await fetch(url, { headers })).json();
console.log("現在:", { site_url: before.site_url, disable_signup: before.disable_signup, uri_allow_list: before.uri_allow_list });
const allow = new Set((before.uri_allow_list ?? "").split(",").filter(Boolean));
allow.add(`${siteUrl}/auth/confirm`);
allow.add(`${siteUrl}/auth/callback`);
allow.add("http://localhost:3000/auth/confirm");
allow.add("http://localhost:3000/auth/callback");
const res = await fetch(url, {
  method: "PATCH",
  headers,
  body: JSON.stringify({ site_url: siteUrl, disable_signup: true, uri_allow_list: [...allow].join(",") }),
});
if (!res.ok) {
  console.error("FAILED", res.status, await res.text());
  process.exit(1);
}
const after = await res.json();
console.log("更新後:", { site_url: after.site_url, disable_signup: after.disable_signup, uri_allow_list: after.uri_allow_list });
