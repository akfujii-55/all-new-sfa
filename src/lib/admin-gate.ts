import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

/**
 * 運営管理画面(/admin)の追加パスワード(アクセスコード)。
 * 通常ログインに加えて ADMIN_ACCESS_CODE(環境変数)の入力を求め、合っていれば
 * ユーザー ID に紐付いた署名付きクッキーを一定時間だけ発行する。
 * ADMIN_ACCESS_CODE が未設定なら安全側に倒して /admin は使えない。
 */

export const ADMIN_COOKIE = "sfa_admin_unlock";
/** 解除の有効時間(時間) */
export const ADMIN_UNLOCK_HOURS = 8;

function signingKey() {
  const key = process.env.SUPABASE_JWT_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("署名鍵(SUPABASE_JWT_SECRET)が設定されていません");
  return key;
}

function sign(payload: string) {
  return createHmac("sha256", signingKey()).update(payload).digest("base64url");
}

export function isAdminCodeConfigured() {
  return Boolean(process.env.ADMIN_ACCESS_CODE?.trim());
}

/** 入力されたアクセスコードが正しいか(長さが違っても時間差が出ないように比較する) */
export function verifyAdminCode(input: string) {
  const expected = process.env.ADMIN_ACCESS_CODE?.trim();
  if (!expected) return false;
  const a = Buffer.from(input.trim());
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** 解除クッキーの値(ユーザー ID と期限を署名したもの) */
export function makeUnlockToken(userId: string) {
  const exp = Date.now() + ADMIN_UNLOCK_HOURS * 60 * 60 * 1000;
  const payload = `${userId}.${exp}`;
  return `${payload}.${sign(payload)}`;
}

export function verifyUnlockToken(token: string | undefined, userId: string): boolean {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [uid, expStr, sig] = parts;
  if (uid !== userId) return false;
  if (!/^\d+$/.test(expStr) || Number(expStr) < Date.now()) return false;
  const expected = sign(`${uid}.${expStr}`);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** 現在のリクエストのクッキーで解除済みか */
export async function isAdminUnlocked(userId: string): Promise<boolean> {
  try {
    const store = await cookies();
    return verifyUnlockToken(store.get(ADMIN_COOKIE)?.value, userId);
  } catch {
    return false;
  }
}
