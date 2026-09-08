/**
 * 送信メールの署名。会社名とメールアドレスは固定、担当者名はログイン中の営業担当者(members)の名前。
 * 返信フォーム・新規作成ダイアログの本文に初期表示し、送信前に編集できる。
 */
export const SIGNATURE_COMPANY = "アートトレーディング株式会社";
export const SIGNATURE_EMAIL = "support@art-trading.co.jp";

export function buildSignature(memberName: string | null | undefined) {
  const lines = ["────────────────────", SIGNATURE_COMPANY];
  if (memberName?.trim()) lines.push(memberName.trim());
  lines.push(`メールアドレス: ${SIGNATURE_EMAIL}`);
  return lines.join("\n");
}

/** 本文の初期値。先頭で入力を始められるよう、署名の前に空行を置く */
export function initialBodyWithSignature(signature: string) {
  return `\n\n${signature}`;
}

/** 署名を除いた本文が空か(送信ボタンの有効判定) */
export function isBodyEmpty(body: string, signature: string) {
  return body.replace(signature, "").trim() === "";
}
