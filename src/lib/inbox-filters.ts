/**
 * メール一覧の絞り込みの状態と URL の組み立て。
 * サーバー(page.tsx)とクライアント(inbox-filters.tsx)の両方から使うので "use client" のファイルには置かない
 * (クライアント部品のファイルから export した関数をサーバーで呼ぶと、本番で「Attempted to call inboxHref() from the server」になる)。
 */
export interface InboxFilterState {
  filter: string;
  q: string;
  target: string;
  tagId: string | null;
  accountId: string | null;
}

/** 絞り込みの状態から一覧の URL を組み立てる(「さらに表示」の n は条件を変えたら最初に戻す) */
export function inboxHref(s: InboxFilterState) {
  const p = new URLSearchParams();
  p.set("filter", s.filter);
  if (s.q) {
    p.set("q", s.q);
    p.set("in", s.target);
  }
  if (s.tagId) p.set("tag", s.tagId);
  if (s.accountId) p.set("account", s.accountId);
  return `/inbox?${p.toString()}`;
}
