import type { MailSettings } from "@/lib/settings";

/**
 * 送信メールの署名。会社名・メールアドレス・追加行は設定画面(app_settings)の値、
 * 担当者名はログイン中の営業担当者(members)の名前。
 * 返信フォーム・新規作成ダイアログの本文に初期表示し、送信前に編集できる。
 */
export function buildSignature(
  settings: Pick<MailSettings, "signature_company" | "signature_email" | "signature_extra">,
  memberName: string | null | undefined,
) {
  const lines = ["────────────────────"];
  if (settings.signature_company.trim()) lines.push(settings.signature_company.trim());
  if (memberName?.trim()) lines.push(memberName.trim());
  if (settings.signature_email.trim()) lines.push(`メールアドレス: ${settings.signature_email.trim()}`);
  for (const l of settings.signature_extra.split("\n")) if (l.trim()) lines.push(l.trim());
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
