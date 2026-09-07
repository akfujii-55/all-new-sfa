// 問い合わせを全件削除する(自動登録されていた分のクリーンアップ用)
// 使い方: node scripts/delete-all-inquiries.mjs
// メール・案件側の inquiry_id は外部キー(on delete set null)で自動的に外れます。
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")];
    }),
);

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { count: before } = await db.from("inquiries").select("id", { count: "exact", head: true });
console.log("削除前の問い合わせ件数:", before);

const { error, count } = await db.from("inquiries").delete({ count: "exact" }).not("id", "is", null);
if (error) {
  console.error("削除に失敗しました:", error.message);
  process.exit(1);
}
console.log("削除した件数:", count);

const { count: linked } = await db.from("emails").select("id", { count: "exact", head: true }).not("inquiry_id", "is", null);
console.log("問い合わせに紐付いたままのメール:", linked);
