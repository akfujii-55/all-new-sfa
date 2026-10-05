/**
 * 宛先・CC の入力欄で使う、アドレスの候補と文字列の扱い。
 * クライアント部品からも読むので、サーバー専用のものを import しない。
 */

/** 入力中に出す候補 1 件。hint は出どころ(社内・取引先名・本文に記載 など) */
export interface AddressOption {
  email: string;
  name: string | null;
  hint: string;
}

// 末尾は英字だけの TLD に限る(本文に混ざる画像の参照 image001.png@01DB… のようなものを拾わない)
const ADDRESS_RE = /[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}(?![a-z0-9-])/gi;

/** 入力欄の文字列をアドレスの並びにする(区切りはカンマ・セミコロン・空白) */
export function splitAddresses(value: string | null | undefined): string[] {
  return (value ?? "")
    .split(/[,;\s]+/)
    .map((a) => a.trim())
    .filter((a) => a.includes("@"));
}

/** 本文などの文章に書かれているメールアドレスを出現順に拾う(小文字、重複なし) */
export function extractAddresses(text: string | null | undefined): string[] {
  const found: string[] = [];
  for (const m of (text ?? "").matchAll(ADDRESS_RE)) {
    const address = m[0].toLowerCase();
    if (!found.includes(address)) found.push(address);
  }
  return found;
}

/** 大文字小文字を区別せずに重複を除き、exclude のアドレスを外す(並びは最初に出た順) */
export function uniqueAddresses(list: string[], exclude: Iterable<string> = []): string[] {
  const seen = new Set([...exclude].map((a) => a.toLowerCase()));
  const out: string[] = [];
  for (const raw of list) {
    const address = raw.trim();
    const key = address.toLowerCase();
    if (!address.includes("@") || seen.has(key)) continue;
    seen.add(key);
    out.push(address);
  }
  return out;
}

/** 入力中の最後の 1 語(候補を探す文字) */
export function lastToken(value: string): string {
  return value.slice(value.search(/[^,;\s]*$/));
}

/** 入力中の最後の 1 語を候補のアドレスに置き換え、続けて次を打てるよう区切りを付ける */
export function replaceLastToken(value: string, email: string): string {
  return `${value.slice(0, value.search(/[^,;\s]*$/))}${email}, `;
}

/** 入力欄の末尾にアドレスを 1 つ足す */
export function appendAddress(value: string, email: string): string {
  const base = value.trim().replace(/[,;]+$/, "").trim();
  return base ? `${base}, ${email}` : email;
}

const fold = (s: string) => s.normalize("NFKC").toLowerCase();

/** 候補が入力中の文字に当てはまるか(名前・アドレスのどちらか。全角半角・大文字小文字は区別しない) */
export function matchesAddress(option: AddressOption, query: string): boolean {
  const q = fold(query.trim());
  if (!q) return false;
  return fold(option.email).includes(q) || fold(option.name ?? "").replace(/\s+/g, "").includes(q.replace(/\s+/g, ""));
}
