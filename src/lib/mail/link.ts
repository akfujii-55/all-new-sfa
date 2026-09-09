import type { SupabaseClient } from "@supabase/supabase-js";
import { extractFromEmail, isFreeMail, parseFormNotification, type Extracted } from "./extract";

type Db = SupabaseClient;

export interface Counterpart {
  address: string;
  name: string;
}

/**
 * メールの「相手(顧客側)」を決める。
 * 受信メールが自社サイトの問い合わせフォーム通知(送信元は通知システム)なら、
 * 本文に書かれた問い合わせ者本人を相手として扱う。
 */
export function resolveCounterpart(opts: {
  direction: "inbound" | "outbound";
  from: Counterpart;
  to: Counterpart[];
  cc: Counterpart[];
  /** 自社のメールアドレス(登録済みアカウント全部) */
  self: string | string[];
  text: string;
}): { counterpart: Counterpart | null; isForm: boolean } {
  const selves = new Set((Array.isArray(opts.self) ? opts.self : [opts.self]).map((a) => a.toLowerCase()));
  if (opts.direction === "outbound") {
    return {
      counterpart: opts.to.find((t) => t.address && !selves.has(t.address)) ?? opts.cc.find((c) => !selves.has(c.address)) ?? null,
      isForm: false,
    };
  }
  const form = parseFormNotification(opts.text);
  if (form && form.email !== opts.from.address) {
    return { counterpart: { address: form.email, name: form.name ?? "" }, isForm: true };
  }
  return { counterpart: opts.from, isForm: false };
}

/**
 * 配送エラー通知や自動送信専用のアドレスなら true。
 * これらは顧客ではないので、担当者・取引先の自動登録や案件の紐付けをしない(メール自体はスレッドに残す)。
 */
export function isSystemAddress(address: string | null | undefined): boolean {
  if (!address) return false;
  const local = address.toLowerCase().split("@")[0] ?? "";
  return /^(mailer-daemon|postmaster|no-?reply|do-?not-?reply|noreply-|bounce|bounces|notifications?)(\b|[-_.+@]|$)/.test(local);
}

/** 自社アドレス・自社ドメイン以外なら true。self には登録済みアカウントのアドレスを全部渡す */
export function isExternalAddress(address: string | null | undefined, self: string | string[]): boolean {
  if (!address) return false;
  const a = address.toLowerCase();
  const selves = (Array.isArray(self) ? self : [self]).map((x) => x.toLowerCase()).filter(Boolean);
  if (selves.includes(a)) return false;
  // フリーメールのドメインは「自社ドメイン」扱いにしない(gmail.com の顧客を除外しないため)
  const domains = selves.map((x) => x.split("@")[1]).filter((d) => d && !isFreeMail(d));
  return !domains.some((d) => a.endsWith(`@${d}`));
}

/**
 * 相手のアドレスから担当者(contacts)と取引先(companies)を特定する。無ければ作成する。
 * 受信メールで新規作成するときはメール本文から会社名・氏名などを抽出する。
 */
export async function findOrCreateContact(
  db: Db,
  opts: {
    counterpart: Counterpart;
    direction: "inbound" | "outbound";
    subject: string | null;
    text: string;
    /** 既にスレッドから引き継いだ取引先があればそれを使う */
    companyId?: string | null;
    /** 事前に抽出済みならそれを使う(再抽出を避ける) */
    extracted?: Extracted | null;
  },
): Promise<{ contactId: string | null; companyId: string | null; extracted: Extracted | null }> {
  const { counterpart } = opts;
  let companyId = opts.companyId ?? null;

  const { data: existing } = await db.from("contacts").select("id, company_id").eq("email", counterpart.address).maybeSingle();
  if (existing) {
    return { contactId: existing.id, companyId: companyId ?? existing.company_id, extracted: opts.extracted ?? null };
  }

  let extracted = opts.extracted ?? null;
  if (!extracted && opts.direction === "inbound") {
    extracted = await extractFromEmail({
      fromName: counterpart.name || null,
      fromAddress: counterpart.address,
      subject: opts.subject,
      text: opts.text,
    });
  }
  const domain = counterpart.address.split("@")[1] ?? "";
  if (!companyId) {
    companyId = await findOrCreateCompany(db, domain, extracted?.company_name ?? null, counterpart.name || extracted?.person_name || null);
  }
  const { data: created } = await db
    .from("contacts")
    .insert({
      company_id: companyId,
      name: extracted?.person_name || counterpart.name || counterpart.address.split("@")[0],
      email: counterpart.address,
      title: extracted?.person_title ?? null,
      phone: extracted?.phone ?? null,
    })
    .select("id")
    .single();
  return { contactId: created?.id ?? null, companyId, extracted };
}

export async function findOrCreateCompany(db: Db, domain: string, extractedName: string | null, personName: string | null) {
  const free = !domain || isFreeMail(domain);
  if (!free) {
    const { data: byDomain } = await db.from("companies").select("id").eq("domain", domain).maybeSingle();
    if (byDomain) return byDomain.id;
  }
  if (extractedName) {
    const { data: byName } = await db.from("companies").select("id").eq("name", extractedName).maybeSingle();
    if (byName) {
      if (!free) await db.from("companies").update({ domain }).eq("id", byName.id).is("domain", null);
      return byName.id;
    }
  }
  const name = extractedName || (free ? `${personName ?? domain}(個人)` : domainToName(domain));
  const { data: created } = await db
    .from("companies")
    .insert({ name, domain: free ? null : domain, website: free ? null : `https://${domain}` })
    .select("id")
    .single();
  return created?.id ?? null;
}

function domainToName(domain: string) {
  const base = domain.split(".")[0] ?? domain;
  return base.charAt(0).toUpperCase() + base.slice(1);
}
