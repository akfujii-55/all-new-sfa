import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import { userError } from "@/lib/errors";

/**
 * メールアカウントのパスワード・通知先のシークレットを DB に保存するための暗号化(AES-256-GCM)。
 * 暗号文は `<版>:<iv>:<tag>:<暗号文>`(すべて base64)。版で鍵の由来が分かる:
 * - v2: 専用の鍵 MAIL_CREDENTIALS_KEY から導出(本番はこれ)。DB の全権限を持つサービスロールキーが漏れても、この鍵が無ければ復号できない
 * - v1: 旧形式。MAIL_CREDENTIALS_KEY があればそれ、無ければ SUPABASE_SERVICE_ROLE_KEY から導出していた(どちらで作られたか暗号文からは分からないので、復号は両方を順に試す。GCM の認証タグで正しい鍵しか通らない)
 * 新しく暗号化するときは専用鍵があれば常に v2。v1 の行は毎朝の定期処理(rotateLegacySecrets)が v2 に書き換える。
 * 専用鍵が無い環境(開発など)では v1 のまま動く。
 */

const DEDICATED_ENV = "MAIL_CREDENTIALS_KEY";

function derive(secret: string): Buffer {
  return createHash("sha256").update(secret).digest();
}

/** 専用鍵が設定されているか */
export function hasDedicatedKey(): boolean {
  return Boolean(process.env[DEDICATED_ENV]);
}

let warned = false;
/** 新しく暗号化するときの鍵と版 */
function primary(): { version: "v1" | "v2"; key: Buffer } {
  const dedicated = process.env[DEDICATED_ENV];
  if (dedicated) return { version: "v2", key: derive(dedicated) };
  const legacy = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!legacy) throw userError("メールの認証情報を保存できません。運営にお問い合わせください(暗号鍵が未設定)");
  if (process.env.NODE_ENV === "production" && !warned) {
    warned = true;
    console.warn(`[crypto] ${DEDICATED_ENV} が未設定のため、暗号鍵をサービスロールキーから導出しています。専用の鍵を設定してください`);
  }
  return { version: "v1", key: derive(legacy) };
}

/** 版ごとの復号に使う鍵の候補(順に試す) */
function candidates(version: string): Buffer[] {
  const dedicated = process.env[DEDICATED_ENV];
  const legacy = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (version === "v2") return dedicated ? [derive(dedicated)] : [];
  if (version === "v1") return [dedicated, legacy].filter((s): s is string => Boolean(s)).map(derive);
  return [];
}

export function encryptSecret(plain: string): string {
  const { version, key } = primary();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${version}:${iv.toString("base64")}:${tag.toString("base64")}:${enc.toString("base64")}`;
}

export function decryptSecret(stored: string): string {
  const [v, iv, tag, enc] = stored.split(":");
  if ((v !== "v1" && v !== "v2") || !iv || !tag || !enc) throw userError("暗号化された認証情報の形式が不正です");
  const keys = candidates(v);
  if (keys.length === 0) throw userError("メールの認証情報を読めません。運営にお問い合わせください(暗号鍵が未設定)");
  let lastError: unknown = null;
  for (const key of keys) {
    try {
      const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
      decipher.setAuthTag(Buffer.from(tag, "base64"));
      return Buffer.concat([decipher.update(Buffer.from(enc, "base64")), decipher.final()]).toString("utf8");
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError instanceof Error ? lastError : userError("メールの認証情報を復号できませんでした");
}

/** 旧形式(v1)の暗号文か */
export function isLegacySecret(stored: string | null | undefined): boolean {
  return typeof stored === "string" && stored.startsWith("v1:");
}

/** 旧形式の暗号文を専用鍵で作り直す。専用鍵が無い、または既に v2 なら null */
export function reencryptLegacy(stored: string): string | null {
  if (!hasDedicatedKey() || !isLegacySecret(stored)) return null;
  return encryptSecret(decryptSecret(stored));
}
