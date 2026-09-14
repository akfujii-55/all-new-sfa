/**
 * メールテンプレートの差し込み項目。件名・本文の {{取引先}} のような印を、送る相手や案件の情報に置き換える。
 * 置き換えは画面側(テンプレートを選んだ時点)で行い、値が分からなかった項目はそのまま残して送信前の確認画面で赤く示す。
 * サーバーの sendEmail も残った項目があれば拒否する。
 */

export const MERGE_FIELDS = [
  { key: "取引先", label: "相手の会社名" },
  { key: "担当者名", label: "相手の担当者の氏名" },
  { key: "担当者メール", label: "相手のメールアドレス" },
  { key: "自社担当者", label: "ログイン中の営業担当者の名前" },
  { key: "自社会社名", label: "署名の会社名(設定画面)" },
  { key: "自社メール", label: "差出人のメールアドレス" },
  { key: "案件名", label: "案件ページから作成したときの案件名" },
  { key: "元の件名", label: "返信元メール(問い合わせ)の件名" },
  { key: "問い合わせ本文", label: "相手のメールを「>」付きで引用" },
  { key: "受信日時", label: "相手のメールを受信した日時" },
] as const;

export type MergeKey = (typeof MERGE_FIELDS)[number]["key"];
/** 差し込む値。空文字や未設定の項目は置き換えずに残す */
export type MergeVars = Partial<Record<MergeKey, string | null | undefined>>;

const MERGE_PATTERN = /\{\{\s*([^{}\s]+)\s*\}\}/g;

/** 差し込み項目を値に置き換える。値が無い項目は {{…}} のまま残す */
export function renderMerge(text: string, vars: MergeVars): string {
  return text.replace(MERGE_PATTERN, (m, k: string) => {
    const v = (vars as Record<string, string | null | undefined>)[k];
    return v ? v : m;
  });
}

/** 残っている(置き換えられなかった)差し込み項目。重複を除いて出現順に返す */
export function unresolvedMerges(text: string): string[] {
  const found: string[] = [];
  for (const m of text.matchAll(MERGE_PATTERN)) {
    const token = `{{${m[1]}}}`;
    if (!found.includes(token)) found.push(token);
  }
  return found;
}

/** 相手のメールを引用する形(返信の末尾や {{問い合わせ本文}} に使う) */
export function buildQuote(receivedAt: string, fromLabel: string, body: string | null | undefined) {
  return `${receivedAt} ${fromLabel}:\n${(body ?? "").split("\n").map((l) => `> ${l}`).join("\n")}`;
}

/** 差出人アカウントの候補から自社メールを決め、ログイン中の担当者と署名の会社名を合わせる */
export function selfMergeVars(self: { memberName: string; companyName: string; fromEmail: string }): MergeVars {
  return { 自社担当者: self.memberName, 自社会社名: self.companyName, 自社メール: self.fromEmail };
}

export const MAX_EMAIL_TEMPLATES = 10;
export const EMAIL_TEMPLATE_LIMITS = { name: 50, subject: 200, body: 5000 } as const;
