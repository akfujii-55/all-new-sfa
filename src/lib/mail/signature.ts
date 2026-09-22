import type { MailSettings } from "@/lib/settings";
import { renderMerge } from "@/lib/mail/merge";

/**
 * 送信メールの署名。
 * - 共通: 会社名・追加行は設定画面(app_settings)、担当者名はログイン中の営業担当者(members)、
 *   メールアドレスは送信元アカウントのアドレス(アカウントが決まらないときは設定の「メールアドレス」)。
 * - アカウント専用(mail_accounts.signature)があればそちらを使う。{{自社担当者}} {{自社メール}} を差し込める。
 * 返信フォーム・新規作成ダイアログの本文に初期表示し、送信元を切り替えると差し替わる。送信前に編集できる。
 */

const SEPARATOR = "────────────────────";

export type SignatureAccount = { email: string; signature?: string | null };

export function buildSignature(
  settings: Pick<MailSettings, "signature_company" | "signature_email" | "signature_extra">,
  memberName: string | null | undefined,
  account?: SignatureAccount | null,
) {
  const lines = [SEPARATOR];
  const own = account?.signature?.trim();
  if (own) {
    const rendered = renderMerge(own, { 自社担当者: memberName?.trim() ?? "", 自社メール: account?.email ?? "", 自社会社名: settings.signature_company.trim() });
    for (const l of rendered.split("\n")) if (l.trim()) lines.push(l.trim());
    return lines.join("\n");
  }
  if (settings.signature_company.trim()) lines.push(settings.signature_company.trim());
  if (memberName?.trim()) lines.push(memberName.trim());
  const email = account?.email?.trim() || settings.signature_email.trim();
  if (email) lines.push(`メールアドレス: ${email}`);
  for (const l of settings.signature_extra.split("\n")) if (l.trim()) lines.push(l.trim());
  return lines.join("\n");
}

/** 本文の初期値。先頭で入力を始められるよう、署名の前に空行を置く */
export function initialBodyWithSignature(signature: string) {
  return `\n\n${signature}`;
}

/** 送信元アカウントを切り替えたとき、本文に入っている古い署名を新しい署名に差し替える(署名を手で消していれば何もしない) */
export function swapSignature(body: string, from: string, to: string) {
  if (from === to || !from || !body.includes(from)) return body;
  return body.replace(from, to);
}

/** 署名を除いた本文が空か(送信ボタンの有効判定) */
export function isBodyEmpty(body: string, signature: string) {
  return body.replace(signature, "").trim() === "";
}
