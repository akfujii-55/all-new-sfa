import { isInboundAddress } from "@/lib/mail/inbound";
import { resolveCounterpart } from "@/lib/mail/link";
import { buildQuote, type MergeVars } from "@/lib/mail/merge";
import { extractAddresses, splitAddresses, uniqueAddresses, type AddressOption } from "@/lib/mail/addresses";
import { fmtDateTime } from "@/lib/format";
import type { Email } from "@/lib/types";

/** 返信フォームに渡す値(スレッド画面と問い合わせ詳細で共通) */
export interface ReplyContext<E = Email> {
  /** 返信先。相手のメールの差出人(自社サイトのフォーム通知は本文の問い合わせ者) */
  replyTo: string;
  /** 「全員に返信」と同じ CC */
  replyCc: string;
  /** CC の候補(このスレッドの差出人・宛先・CC、本文に書かれたアドレス) */
  addressOptions: AddressOption[];
  /** 相手の最後のメールの引用 */
  quote: string;
  /** テンプレートの差し込み項目 */
  merge: MergeVars;
  /** 返信の差出人にするアカウント(このスレッドを受信したアカウント) */
  threadAccountId: string | null;
  /** 相手からの最後のメール(無ければスレッドの最後) */
  latestInbound: E;
  /** 自社サイトのフォーム通知か */
  isForm: boolean;
}

type ThreadEmail = Pick<Email, "id" | "direction" | "from_address" | "from_name" | "to_addresses" | "cc_addresses" | "text_body" | "received_at" | "subject" | "account_id">;

/**
 * スレッドのメール(受信日時の昇順)から、返信フォームの宛先・CC・候補・引用・差し込み項目を組み立てる。
 * - 返信先: 自社サイトのフォーム通知は差出人が通知システム(例: contact@mylogi.jp のグループ)なので、本文に書かれた問い合わせ者本人に返信する。通知の CC(CRM やチャットツールへの転送先)も引き継がない。
 * - CC: 「全員に返信」と同じく、相手のメールの宛先(自社のアカウント以外)と CC、その後こちらから送ったメールで足した CC を引き継ぐ。手動転送で届いたメールは宛先が転送の受け口アドレスなので外す。
 * - 候補: このスレッドのこれまでの差出人・宛先・CC と、相手のメールの本文に書かれたアドレス(「CC に入れてください」への対応)。フォーム通知はヘッダーが通知システムと社内の転送先なので、本文のアドレスだけにする。
 */
export function buildReplyContext<E extends ThreadEmail>(
  emails: E[],
  opts: {
    /** 自社のメールアカウントのアドレス */
    selfAddresses: string[];
    /** 取引先の担当者(アドレス → 名前の補完に使う) */
    contacts: { email: string | null; name: string }[];
    /** スレッドに紐付く取引先・担当者の名前(差し込み項目用) */
    companyName: string | null;
    contactName: string | null;
  },
): ReplyContext<E> {
  const latest = emails[emails.length - 1];
  const latestInbound = [...emails].reverse().find((e) => e.direction === "inbound") ?? latest;
  const selves = new Set(opts.selfAddresses.map((a) => a.toLowerCase()));
  const threadAccountId = [...emails].reverse().find((e) => e.account_id)?.account_id ?? null;

  const { counterpart, isForm } = resolveCounterpart({
    direction: latestInbound.direction,
    from: { address: latestInbound.from_address, name: latestInbound.from_name ?? "" },
    to: latestInbound.to_addresses.map((address) => ({ address, name: "" })),
    cc: latestInbound.cc_addresses.map((address) => ({ address, name: "" })),
    self: [...selves],
    text: latestInbound.text_body ?? "",
  });
  const newestFirst = [...emails].reverse();
  // 返信先に自社のアカウント・転送の受け口アドレスは入れない(送信元を宛先にしたメールは相手に届かない)
  const isExternal = (a: string) => a.includes("@") && !selves.has(a.trim().toLowerCase()) && !isInboundAddress(a);
  const replyToCandidates = isForm && counterpart ? [counterpart.address] : latestInbound.direction === "inbound" ? [latestInbound.from_address] : latestInbound.to_addresses;
  let replyToList = uniqueAddresses(replyToCandidates.filter(isExternal));
  if (replyToList.length === 0) {
    // 相手のアドレスが取れないとき(自社から自社へのメールしか無い、読み取れないフォーム通知など)は、スレッドでいちばん新しい相手のアドレス。無ければ空にして入力してもらう
    const fallback = newestFirst.flatMap((m) => (m.direction === "inbound" ? [m.from_address] : [...m.to_addresses, ...m.cc_addresses])).find(isExternal);
    replyToList = fallback ? [fallback] : [];
  }
  const replyTo = replyToList.join(", ");
  const notOurs = (a: string) => !isInboundAddress(a);
  const since = emails.slice(emails.indexOf(latestInbound));
  const replyCc = isForm
    ? ""
    : uniqueAddresses(
        since.flatMap((m) => (m === latestInbound && m.direction === "inbound" ? [...m.to_addresses, ...m.cc_addresses] : m.cc_addresses)).filter(notOurs),
        [...selves, ...splitAddresses(replyTo)],
      ).join(", ");

  const contactNames = new Map(opts.contacts.filter((c) => c.email).map((c) => [c.email!.toLowerCase(), c.name]));
  const addressOptions: AddressOption[] = [];
  const addOption = (email: string, name: string | null | undefined, hint: string) => {
    const key = email.trim().toLowerCase();
    if (!key.includes("@") || selves.has(key) || isInboundAddress(key) || addressOptions.some((o) => o.email.toLowerCase() === key)) return;
    addressOptions.push({ email: email.trim(), name: name?.trim() || contactNames.get(key) || null, hint });
  };
  // いちばん新しい相手のメールの本文に書かれたアドレスを先頭に出す
  if (latestInbound.direction === "inbound") for (const a of extractAddresses(latestInbound.text_body)) addOption(a, null, "本文に記載");
  if (!isForm) {
    for (const m of newestFirst) {
      addOption(m.from_address, m.from_name, "これまでの差出人");
      for (const a of m.to_addresses) addOption(a, null, "これまでの宛先");
      for (const a of m.cc_addresses) addOption(a, null, "これまでの CC");
    }
  }
  for (const m of newestFirst) {
    if (m.direction !== "inbound") continue;
    for (const a of extractAddresses(m.text_body)) addOption(a, null, "本文に記載");
  }

  const quote = buildQuote(fmtDateTime(latestInbound.received_at), latestInbound.from_name || latestInbound.from_address, latestInbound.text_body);
  // 相手の会社名・氏名はスレッドに紐付く取引先・担当者(フォーム通知なら本文の問い合わせ者)
  const merge: MergeVars = {
    取引先: opts.companyName ?? "",
    担当者名: opts.contactName ?? (isForm ? counterpart?.name ?? "" : latestInbound.direction === "inbound" ? latestInbound.from_name ?? "" : ""),
    担当者メール: replyTo.split(",")[0]?.trim() ?? "",
    元の件名: latestInbound.subject ?? "",
    問い合わせ本文: quote,
    受信日時: fmtDateTime(latestInbound.received_at),
  };

  return { replyTo, replyCc, addressOptions, quote, merge, threadAccountId, latestInbound, isForm };
}
