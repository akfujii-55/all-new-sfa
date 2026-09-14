/**
 * 会社名の表記ゆれを吸収して同じ会社かどうかを判定するためのキー。
 * 「株式会社◯◯」「◯◯株式会社」「(株)◯◯」「◯◯ 株式会社」「ABC Co., Ltd.」「ABC Inc.」を同じキーにする。
 * NFKC(全角半角・㈱→(株))→ 小文字 → 空白除去 → 法人格の除去 → 記号の除去。
 */
const JP_FORMS =
  /(株式会社|有限会社|合同会社|合資会社|合名会社|一般社団法人|一般財団法人|公益社団法人|公益財団法人|社会福祉法人|学校法人|医療法人(?:社団|財団)?|宗教法人|特定非営利活動法人|npo法人|\(株\)|\(有\)|\(同\)|\(合\)|\(一社\)|\(一財\)|\(医\)|\(学\))/g;
const EN_FORMS = /(co\.?,?\s*ltd\.?|company\s*limited|corporation|corp\.?|incorporated|inc\.?|limited|ltd\.?|llc|l\.l\.c\.|k\.k\.|kk|gmbh|company|co\.)$/;

export function companyNameKey(name: string | null | undefined): string {
  if (!name) return "";
  let s = name.normalize("NFKC").toLowerCase().replace(/\s+/g, "");
  s = s.replace(JP_FORMS, "");
  s = s.replace(/^the/, "");
  // 末尾の英語法人格(「abc co., ltd.」など)は何度か剥がす(「abc holdings co., ltd.」→「abcholdings」)
  for (let i = 0; i < 3; i++) {
    const next = s.replace(EN_FORMS, "");
    if (next === s) break;
    s = next;
  }
  s = s.replace(/[.,、。・･\-‐−–—_&＆'"()（）「」『』【】]/g, "");
  return s;
}

/** 「氏名(個人)」のように、会社名が分からない相手のために自動で作った取引先なら true */
export function isPersonalPlaceholder(company: { name: string; domain: string | null }): boolean {
  return !company.domain && /\(個人\)$/.test(company.name.normalize("NFKC"));
}
