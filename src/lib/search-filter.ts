/**
 * PostgREST の or フィルタに入れる ilike のパターン(部分一致)を作る。
 * カンマ・括弧・ダブルクォートを含む語でも壊れないよう値全体を引用符で囲み、
 * LIKE のワイルドカード(% _ \)は文字どおりに検索する。
 * 引用符内では PostgREST がバックスラッシュをエスケープ文字として扱うため、
 * LIKE 用のエスケープを施したあとにバックスラッシュ自体を二重にする。
 */
export function ilikePattern(q: string): string {
  const likeEscaped = q.replace(/[\\%_]/g, (c) => `\\${c}`);
  const quoted = likeEscaped.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `"%${quoted}%"`;
}
