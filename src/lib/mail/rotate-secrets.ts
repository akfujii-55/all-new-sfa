import type { SupabaseClient } from "@supabase/supabase-js";
import { hasDedicatedKey, reencryptLegacy } from "@/lib/mail/crypto";
import { errorMessage, logSystem } from "@/lib/log";

/**
 * 旧形式(v1、サービスロールキー由来の鍵)で保存された認証情報を、専用鍵(MAIL_CREDENTIALS_KEY)の v2 に書き換える。
 * 毎朝の定期処理(/api/mail/maintenance)がテナントごとに呼ぶ。専用鍵が無ければ何もしない。
 * 対象: mail_accounts.password_enc(IMAP/SMTP のパスワード)、mail_notifications.secret_enc(Lark 署名 / Chatwork トークン)。
 * 復号できない行(鍵が合わない)は飛ばして warn に残す。
 */
export async function rotateLegacySecrets(db: SupabaseClient): Promise<{ rotated: number; failed: number; remaining: number }> {
  const out = { rotated: 0, failed: 0, remaining: 0 };
  if (!hasDedicatedKey()) return out;
  const targets: { table: string; column: string }[] = [
    { table: "mail_accounts", column: "password_enc" },
    { table: "mail_notifications", column: "secret_enc" },
  ];
  for (const { table, column } of targets) {
    const { data, error } = await db.from(table).select(`id, ${column}`).like(column, "v1:%").limit(500);
    if (error) {
      await logSystem({ level: "warn", source: "crypto.rotate", message: `${table} の認証情報を読めませんでした: ${error.message}`, notify: false }, db);
      continue;
    }
    for (const row of (data ?? []) as unknown as Record<string, string>[]) {
      try {
        const next = reencryptLegacy(row[column]);
        if (!next) continue;
        const { error: upErr } = await db.from(table).update({ [column]: next }).eq("id", row.id);
        if (upErr) throw new Error(upErr.message);
        out.rotated++;
      } catch (e) {
        out.failed++;
        await logSystem({ level: "warn", source: "crypto.rotate", message: `${table} の認証情報を新しい鍵で作り直せませんでした(id ${row.id}): ${errorMessage(e)}`, notify: false }, db);
      }
    }
  }
  for (const { table, column } of targets) {
    const { count } = await db.from(table).select("id", { count: "exact", head: true }).like(column, "v1:%");
    out.remaining += count ?? 0;
  }
  return out;
}
