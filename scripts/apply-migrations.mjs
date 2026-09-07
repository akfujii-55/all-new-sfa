// Supabase Management API 経由でマイグレーションを適用する
// 使い方: SUPABASE_ACCESS_TOKEN=sbp_xxx SUPABASE_PROJECT_REF=xxxx node scripts/apply-migrations.mjs [ファイル名...]
//   ファイル名を指定するとそのマイグレーションだけを適用する(例: node scripts/apply-migrations.mjs 0002_members.sql)
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const token = process.env.SUPABASE_ACCESS_TOKEN;
const ref = process.env.SUPABASE_PROJECT_REF;
if (!token || !ref) {
  console.error("SUPABASE_ACCESS_TOKEN と SUPABASE_PROJECT_REF を設定してください");
  process.exit(1);
}

const dir = join(process.cwd(), "supabase", "migrations");
const only = process.argv.slice(2);
const files = readdirSync(dir)
  .filter((f) => f.endsWith(".sql"))
  .filter((f) => only.length === 0 || only.includes(f))
  .sort();
if (only.length > 0 && files.length !== only.length) {
  console.error("指定されたファイルが見つかりません:", only.filter((f) => !files.includes(f)).join(", "));
  process.exit(1);
}

for (const file of files) {
  const sql = readFileSync(join(dir, file), "utf8");
  process.stdout.write(`applying ${file} ... `);
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  if (!res.ok) {
    console.error("\nFAILED", res.status, await res.text());
    process.exit(1);
  }
  console.log("ok");
}
console.log("done");
