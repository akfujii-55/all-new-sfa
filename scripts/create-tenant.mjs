// 新しい会社(テナント)を作り、最初の管理者(営業担当者)の招待リンクを発行する
// 使い方: node scripts/create-tenant.mjs --name "株式会社サンプル" --slug sample --owner-name "山田太郎" --owner-email yamada@example.com
//   .env.local の NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY を使う。
//   招待リンクは標準出力に表示されるので、管理者へメール等で送る(有効期限は Supabase の設定どおり 24 時間)。
//   ※ 新しいテナントにはまだメールアカウントが無いので、アプリからは招待メールを送れない。
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}

const args = {};
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const m = argv[i].match(/^--([a-z-]+)$/);
  if (m) args[m[1]] = argv[++i];
}
const { name, slug, "owner-name": ownerName, "owner-email": ownerEmail } = args;
if (!name || !slug || !ownerEmail) {
  console.error('使い方: node scripts/create-tenant.mjs --name "会社名" --slug 会社id --owner-name "管理者名" --owner-email 管理者のメール');
  process.exit(1);
}
if (!/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(slug)) {
  console.error("--slug は英小文字・数字・ハイフンで 3〜40 文字(先頭と末尾は英数字)にしてください");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("NEXT_PUBLIC_SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY を設定してください");
  process.exit(1);
}
const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? process.env.SITE_URL ?? "").replace(/\/$/, "");

const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

// 1. テナント + 最初の営業担当者 + 初期設定(DB 関数 create_tenant)
const { data: tenantId, error } = await admin.rpc("create_tenant", {
  p_name: name,
  p_slug: slug,
  p_owner_name: ownerName ?? "",
  p_owner_email: ownerEmail,
});
if (error) {
  console.error("テナントの作成に失敗:", error.message);
  process.exit(1);
}
console.log(`テナントを作成しました: ${name} (会社ID: ${slug}, id: ${tenantId})`);

// 2. 管理者の招待リンク(handle_new_user が member_id / tenant_id で所属を決める)
const { data: member } = await admin.from("members").select("id, name").eq("tenant_id", tenantId).order("created_at").limit(1).single();
const email = ownerEmail.toLowerCase();
let link = await admin.auth.admin.generateLink({
  type: "invite",
  email,
  options: { data: { full_name: member.name, member_id: member.id, tenant_id: tenantId } },
});
let type = "invite";
if (link.error) {
  if (!/already|exists|registered/i.test(link.error.message)) {
    console.error("招待リンクの作成に失敗:", link.error.message);
    console.error("※ テナント自体は作成済みです。アプリの営業担当者ページから招待し直すこともできます。");
    process.exit(1);
  }
  // 既に auth ユーザーがいる(別テナントの利用者など)場合はマジックリンク。所属テナントは変わらないので注意
  console.warn(`注意: ${email} は既に登録済みのユーザーです。既存の所属テナントはそのままです。`);
  link = await admin.auth.admin.generateLink({ type: "magiclink", email });
  type = "magiclink";
  if (link.error) {
    console.error("リンクの作成に失敗:", link.error.message);
    process.exit(1);
  }
}
const tokenHash = link.data.properties.hashed_token;
const base = siteUrl || "https://<アプリのURL>";
console.log("");
console.log("管理者へ以下のリンクを送ってください(24 時間有効):");
console.log(`${base}/auth/confirm?token_hash=${encodeURIComponent(tokenHash)}&type=${type}&next=${encodeURIComponent("/set-password")}`);
