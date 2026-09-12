// 0009(マルチテナント化)より前に保存した添付ファイルを <tenant_id>/... のパスへ移動する
// 使い方: node scripts/migrate-attachments-to-tenant.mjs            # 対象の表示のみ(dry-run)
//         node scripts/migrate-attachments-to-tenant.mjs --apply    # 実際に移動して email_attachments.storage_path を更新する
//   Storage の実体は S3 側のキーがオブジェクト名に依存するため SQL では動かせず、Storage API の move を使う。
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}
const apply = process.argv.includes("--apply");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("NEXT_PUBLIC_SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY を設定してください");
  process.exit(1);
}
const BUCKET = "email-attachments";
const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

const { data: rows, error } = await admin.from("email_attachments").select("id, tenant_id, storage_path");
if (error) {
  console.error("email_attachments の取得に失敗:", error.message);
  process.exit(1);
}
const targets = rows.filter((r) => !r.storage_path.startsWith(`${r.tenant_id}/`));
console.log(`添付ファイル ${rows.length} 件のうち、移動が必要なもの: ${targets.length} 件${apply ? "" : "(dry-run。--apply で実行)"}`);

let moved = 0;
let failed = 0;
for (const r of targets) {
  const to = `${r.tenant_id}/${r.storage_path}`;
  console.log(`${r.storage_path} -> ${to}`);
  if (!apply) continue;
  const { error: mvErr } = await admin.storage.from(BUCKET).move(r.storage_path, to);
  if (mvErr) {
    failed++;
    console.error("  移動に失敗:", mvErr.message);
    continue;
  }
  const { error: upErr } = await admin.from("email_attachments").update({ storage_path: to }).eq("id", r.id);
  if (upErr) {
    failed++;
    console.error("  storage_path の更新に失敗(実体は移動済み):", upErr.message);
    continue;
  }
  moved++;
}
if (apply) console.log(`完了: ${moved} 件を移動、${failed} 件が失敗`);
