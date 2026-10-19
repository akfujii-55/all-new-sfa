/**
 * ログイン後・リンク確認後に戻る先(`?next=`)として安全なパスだけを通す。
 * 「/」で始まるだけの判定では `//evil.example`(プロトコル相対 URL)や `/\evil.example` が外部サイトへのリダイレクトになるため、
 * 先頭が「/」で 2 文字目が「/」「\」でないものだけを同一サイト内のパスとみなす。それ以外は fallback。
 */
export function safeNextPath(next: string | null | undefined, fallback = "/"): string {
  if (!next) return fallback;
  return /^\/(?![/\\])/.test(next) ? next : fallback;
}
