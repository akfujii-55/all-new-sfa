import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * メールアカウントのパスワードを DB に保存するための暗号化(AES-256-GCM)。
 * 鍵は MAIL_CREDENTIALS_KEY、無ければ SUPABASE_SERVICE_ROLE_KEY から導出する(どちらもサーバー専用の値)。
 */
function key(): Buffer {
  const secret = process.env.MAIL_CREDENTIALS_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("MAIL_CREDENTIALS_KEY または SUPABASE_SERVICE_ROLE_KEY が設定されていません");
  return createHash("sha256").update(secret).digest();
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${enc.toString("base64")}`;
}

export function decryptSecret(stored: string): string {
  const [v, iv, tag, enc] = stored.split(":");
  if (v !== "v1" || !iv || !tag || !enc) throw new Error("暗号化されたパスワードの形式が不正です");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(enc, "base64")), decipher.final()]).toString("utf8");
}
