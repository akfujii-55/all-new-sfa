import type { ParsedMail } from "mailparser";

/**
 * 手動転送(メールソフトの「転送」ボタン)の元の差出人を本文から拾う。
 *
 * 手動転送は差出人が自社の人になり、元の差出人は本文の「From: 名前 <アドレス>」(日本語のメールソフトは「差出人:」)にしか残らない。
 * 件名が Fwd: / FW: / 転送: で始まる自社発のメールに限り、その行から相手を拾って受信メールとして扱う。
 * `text` は本文のテキスト(テキスト部分が無い HTML だけのメールは呼び出し側で HTML から起こしたもの)。
 * 拾えたら parsed.from を書き換えて true を返す。
 */
export function unwrapManualForward(parsed: ParsedMail, selves: string[], text: string): boolean {
  const from = parsed.from?.value[0]?.address?.toLowerCase();
  if (!from || !selves.includes(from)) return false;
  if (!isForwardSubject(parsed.subject)) return false;
  const line = text.match(/^[>\s]*\**(?:From|差出人|送信者)\**\s*[::]\s*(.+)$/im)?.[1];
  const address = line?.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i)?.[0]?.toLowerCase();
  if (!line || !address || selves.includes(address)) return false;
  const name = line
    .replace(/<[^>]*>|\[mailto:[^\]]*\]|\(mailto:[^)]*\)/gi, "")
    .replace(address, "")
    .replace(/["'<>]/g, "")
    .replace(/\s+$/, "")
    .trim();
  parsed.from = { value: [{ address, name }], text: line.trim(), html: "" };
  return true;
}

/** 件名が転送のものか(Fwd: / Fw: / FW: / 転送:)。全角コロン・前後の空白も許す */
export function isForwardSubject(subject: string | undefined | null): boolean {
  return /^\s*(fwd?|fw|転送)\s*[::]/i.test(subject ?? "");
}
