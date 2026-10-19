// Supabase の認証設定を社内利用向けにする(自己登録を止め、サイト URL を設定し、パスワードの要件を上げる)
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
const show = (c) => ({ site_url: c.site_url, disable_signup: c.disable_signup, mailer_otp_exp: c.mailer_otp_exp, password_min_length: c.password_min_length, password_hibp_enabled: c.password_hibp_enabled, uri_allow_list: c.uri_allow_list });
console.log("現在:", show(before));
// 未使用の /auth/callback(PKCE)は 2026-10-19 に削除したので許可リストからも外す
const allow = new Set((before.uri_allow_list ?? "").split(",").filter(Boolean).filter((u) => !u.endsWith("/auth/callback")));
allow.add(`${siteUrl}/auth/confirm`);
allow.add("http://localhost:3000/auth/confirm");
const res = await fetch(url, {
  method: "PATCH",
  headers,
  // mailer_otp_exp: 招待リンクの有効期限(秒)。上限の 24 時間にする
  // password_min_length: アプリ側(/set-password)も 8 文字以上を要求している。password_hibp_enabled: 漏洩したことのあるパスワードを拒否(HaveIBeenPwned)
  body: JSON.stringify({ site_url: siteUrl, disable_signup: true, uri_allow_list: [...allow].join(","), mailer_otp_exp: 86400, password_min_length: 8, password_hibp_enabled: true }),
});
if (!res.ok) {
  console.error("FAILED", res.status, await res.text());
  process.exit(1);
}
const after = await res.json();
console.log("更新後:", show(after));
