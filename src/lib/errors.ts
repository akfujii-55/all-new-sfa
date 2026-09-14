/**
 * Server Action のエラーメッセージを本番でも画面に出すための仕組み。
 *
 * Next.js は本番ビルドでは Server Action / Server Component が投げた Error の message をブラウザに送らず、
 * 「Minified React error #441」(An error occurred in the Server Components render...)に置き換える。
 * ただし error.digest だけはそのまま届くので、利用者に見せてよいメッセージは digest に載せて運ぶ。
 *
 * - サーバー側: `throw userError("〜してください")` で投げる(`new Error` の代わり)。
 * - クライアント側: `toast.error(actionErrorMessage(e))` で取り出す。
 * このファイルはサーバー・クライアント両方から import されるので、サーバー専用のモジュールを import しないこと。
 */

const USER_MESSAGE_PREFIX = "user-message:";

export const GENERIC_ACTION_ERROR = "処理に失敗しました。時間をおいてもう一度お試しください";

/** 利用者に見せてよいメッセージを持つ Error。本番でも digest 経由でメッセージが画面に届く */
export function userError(message: string, options?: { cause?: unknown }): Error {
  const err = new Error(message, options?.cause instanceof Error ? { cause: options.cause } : undefined);
  markUserError(err);
  return err;
}

/** 既存の Error にユーザー向けメッセージの印を付ける(digest を設定する) */
export function markUserError<T extends Error>(err: T): T {
  (err as T & { digest?: string }).digest = USER_MESSAGE_PREFIX + err.message;
  return err;
}

/** Server Action の呼び出しで catch した値から、画面に出すメッセージを取り出す */
export function actionErrorMessage(e: unknown, fallback = GENERIC_ACTION_ERROR): string {
  if (typeof e === "object" && e !== null) {
    const digest = (e as { digest?: unknown }).digest;
    if (typeof digest === "string" && digest.startsWith(USER_MESSAGE_PREFIX)) return digest.slice(USER_MESSAGE_PREFIX.length);
  }
  const message = e instanceof Error ? e.message : typeof e === "string" ? e : "";
  if (!message || /Server Components render|Minified React error #441/.test(message)) return fallback;
  return message;
}
