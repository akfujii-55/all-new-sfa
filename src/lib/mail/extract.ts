import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

export interface Extracted {
  company_name: string | null;
  person_name: string | null;
  /** 問い合わせ者本人のメールアドレス。フォーム通知メールでは本文に書かれたアドレス */
  person_email: string | null;
  person_title: string | null;
  phone: string | null;
  summary: string;
  category: string;
  wants_appointment: boolean;
}

/** 問い合わせフォームの通知メール本文から取り出した問い合わせ者の情報 */
export interface FormNotification {
  name: string | null;
  company: string | null;
  email: string;
  phone: string | null;
  /** 「お問い合わせ内容」などの自由記述部分 */
  message: string;
}

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const FORM_HINT_RE = /お問い合わせがありました|問い合わせフォーム|フォームより|フォームから|contact form/i;
const FORM_LABELS = {
  name: /^(お名前|氏名|名前|ご担当者名|担当者名|name)\s*[:：]\s*(.+)$/i,
  company: /^(会社名|御社名|貴社名|法人名|団体名|組織名|company)\s*[:：]\s*(.+)$/i,
  email: /^(メールアドレス|メール|e-?mail|email address)\s*[:：]\s*(.+)$/i,
  phone: /^(電話番号|電話|tel|phone)\s*[:：]\s*(.+)$/i,
  message: /^(お問い合わせ内容|問い合わせ内容|ご相談内容|ご要望|内容|message|現状の課題やご相談内容があれば教えてください。?)\s*[:：]\s*(.*)$/i,
};

/**
 * 自社サイトの問い合わせフォームなど、通知システムが送るメールから問い合わせ者本人の情報を取り出す。
 * 「お名前: ◯◯」「メールアドレス: ◯◯」のようなラベル付き行が並ぶ形式を対象にし、
 * メールアドレスの行が見つからなければ null(通常のメールとして扱う)。
 */
export function parseFormNotification(text: string): FormNotification | null {
  const body = (text || "").replace(/\r\n/g, "\n");
  const lines = body.split("\n").map((l) => l.trim());
  const out: { name?: string; company?: string; email?: string; phone?: string } = {};
  let message = "";
  let inMessage = false;
  let labeled = 0;
  for (const line of lines) {
    const em = line.match(FORM_LABELS.email);
    if (em) {
      const found = em[2].match(EMAIL_RE)?.[0];
      if (found && !out.email) { out.email = found.toLowerCase(); labeled++; inMessage = false; continue; }
    }
    const nm = line.match(FORM_LABELS.name);
    if (nm && !out.name) { out.name = nm[2].trim(); labeled++; inMessage = false; continue; }
    const cm = line.match(FORM_LABELS.company);
    if (cm && !out.company) { out.company = cm[2].trim(); labeled++; inMessage = false; continue; }
    const pm = line.match(FORM_LABELS.phone);
    if (pm && !out.phone) { out.phone = pm[2].trim() || undefined; labeled++; inMessage = false; continue; }
    const mm = line.match(FORM_LABELS.message);
    if (mm) { message = mm[2] ?? ""; inMessage = true; continue; }
    if (inMessage) {
      // 次のラベル行(「◯◯: 」形式)が来たら自由記述は終わり
      if (/^[^\s:：]{1,30}\s*[:：]\s*\S/.test(line) && line.length < 60) { inMessage = false; continue; }
      message += (message ? "\n" : "") + line;
    }
  }
  if (!out.email) return null;
  // ラベル行が2つ以上、またはフォーム通知らしい文言があるときだけフォームとみなす
  if (labeled < 2 && !FORM_HINT_RE.test(body)) return null;
  const normalize = (v?: string) => {
    const t = (v ?? "").replace(/\s+/g, " ").trim();
    return t && t !== "-" ? t : null;
  };
  // 「植原誓也 植原誓也」のようにふりがな欄の内容が重複しているケースを畳む
  const name = (() => {
    const n = normalize(out.name);
    if (!n) return null;
    const parts = n.split(" ");
    if (parts.length === 2 && parts[0] === parts[1]) return parts[0];
    return n;
  })();
  return {
    name,
    company: normalize(out.company),
    email: out.email,
    phone: normalize(out.phone),
    message: message.trim(),
  };
}

export const FREE_MAIL_DOMAINS = new Set([
  "gmail.com", "yahoo.co.jp", "yahoo.com", "hotmail.com", "hotmail.co.jp", "outlook.com",
  "outlook.jp", "live.jp", "icloud.com", "me.com", "docomo.ne.jp", "ezweb.ne.jp", "au.com",
  "softbank.ne.jp", "i.softbank.jp", "nifty.com", "excite.co.jp", "protonmail.com", "proton.me",
]);

export function isFreeMail(domain: string) {
  return FREE_MAIL_DOMAINS.has(domain.toLowerCase());
}

const CATEGORY_RULES: [RegExp, string][] = [
  [/見積|お見積|価格|料金|費用/i, "見積依頼"],
  [/資料|カタログ|パンフレット/i, "資料請求"],
  [/デモ|打ち合わせ|打合せ|訪問|ミーティング|商談|ご説明|オンライン会議/i, "商談希望"],
  [/導入|検討|提案|相談/i, "導入相談"],
  [/請求書|入金|支払/i, "請求・支払"],
  [/不具合|エラー|障害|サポート|使い方/i, "サポート"],
  [/採用|求人|応募/i, "採用"],
  [/営業|ご案内|セミナー|キャンペーン|広告/i, "営業・案内"],
];

/** 引用部分・署名以降を取り除いた本文を返す */
export function stripQuotes(text: string): string {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  for (const line of lines) {
    if (/^\s*>/.test(line)) continue;
    if (/^On .+wrote:\s*$/.test(line) || /^\d{4}年\d{1,2}月\d{1,2}日.*<.+@.+>.*:?\s*$/.test(line)) break;
    if (/^-{2,}\s*Original Message\s*-{2,}/i.test(line) || /^-----\s*元のメッセージ/.test(line)) break;
    out.push(line);
  }
  return out.join("\n").trim();
}

const COMPANY_RE =
  /((?:株式会社|有限会社|合同会社|一般社団法人|医療法人|学校法人|特定非営利活動法人)\s*[^\s、。,\n]{1,30}|[^\s、。,\n]{1,30}\s*(?:株式会社|有限会社|合同会社|Inc\.|Co\.,?\s*Ltd\.?|Corp(?:oration)?\.?|LLC|K\.K\.))/;

export function ruleBasedExtract(opts: {
  fromName: string | null;
  fromAddress: string;
  subject: string | null;
  text: string;
}): Extracted {
  const form = parseFormNotification(opts.text || "");
  if (form) return formExtract(opts, form);

  const body = stripQuotes(opts.text || "");
  const lines = body.split("\n").map((l) => l.trim()).filter(Boolean);

  // 署名(末尾15行)から会社名・肩書き・電話を探す
  const tail = lines.slice(-15);
  let company: string | null = null;
  let title: string | null = null;
  let phone: string | null = null;
  for (const l of tail) {
    if (!company) {
      const m = l.match(COMPANY_RE);
      if (m) company = m[1].trim();
    }
    if (!title) {
      const m = l.match(/(代表取締役|取締役|部長|課長|係長|主任|マネージャー|担当|リーダー|CEO|CTO|COO|CFO|VP|Director|Manager)/);
      if (m && l.length < 40) title = l;
    }
    if (!phone) {
      const m = l.match(/(?:TEL|Tel|電話|℡)?[:：]?\s*(0\d{1,4}[-‐ー\s]?\d{1,4}[-‐ー\s]?\d{3,4})/);
      if (m) phone = m[1];
    }
  }

  // 冒頭の「株式会社◯◯の△△です」パターン
  if (!company) {
    const head = lines.slice(0, 6).join(" ");
    const m = head.match(COMPANY_RE);
    if (m) company = m[1].trim();
  }

  const personName =
    opts.fromName?.replace(/["']/g, "").trim() ||
    (() => {
      const head = lines.slice(0, 6).join(" ");
      const m = head.match(/(?:の|、)\s*([^\s、。]{1,10})\s*(?:です|と申します|でございます)/);
      return m ? m[1] : null;
    })() ||
    null;

  const haystack = `${opts.subject ?? ""}\n${body}`;
  let category = "問い合わせ";
  for (const [re, label] of CATEGORY_RULES) {
    if (re.test(haystack)) {
      category = label;
      break;
    }
  }
  const wantsAppointment = /打ち合わせ|打合せ|訪問|デモ|ミーティング|ご都合|日程|お時間/.test(haystack);

  const summary = body.replace(/\s+/g, " ").slice(0, 200) || (opts.subject ?? "");

  return {
    company_name: company,
    person_name: personName,
    person_email: opts.fromAddress.toLowerCase() || null,
    person_title: title,
    phone,
    summary,
    category,
    wants_appointment: wantsAppointment,
  };
}

function classify(subject: string | null, text: string) {
  const haystack = `${subject ?? ""}\n${text}`;
  let category = "問い合わせ";
  for (const [re, label] of CATEGORY_RULES) {
    if (re.test(haystack)) {
      category = label;
      break;
    }
  }
  const wantsAppointment = /打ち合わせ|打合せ|訪問|デモ|ミーティング|ご都合|日程|お時間/.test(haystack);
  return { category, wantsAppointment };
}

/** フォーム通知メールのフィールドをそのまま抽出結果にする */
function formExtract(opts: { subject: string | null }, form: FormNotification): Extracted {
  const text = form.message || "";
  const { category, wantsAppointment } = classify(opts.subject, text);
  return {
    company_name: form.company,
    person_name: form.name,
    person_email: form.email,
    person_title: null,
    phone: form.phone,
    summary: text.replace(/\s+/g, " ").slice(0, 200) || (opts.subject ?? ""),
    category,
    wants_appointment: wantsAppointment,
  };
}

const ExtractSchema = z.object({
  company_name: z.string().nullable().describe("送信者の所属会社名。不明なら null"),
  person_name: z.string().nullable().describe("送信者の氏名。不明なら null"),
  person_email: z.string().nullable().describe("問い合わせ者本人のメールアドレス。フォーム通知メールなら本文に書かれた問い合わせ者のアドレス。不明なら null"),
  person_title: z.string().nullable().describe("送信者の役職・部署。不明なら null"),
  phone: z.string().nullable().describe("送信者の電話番号。不明なら null"),
  summary: z.string().describe("問い合わせ内容の要約(日本語、120字以内)"),
  category: z
    .enum(["見積依頼", "資料請求", "商談希望", "導入相談", "請求・支払", "サポート", "採用", "営業・案内", "問い合わせ", "その他"])
    .describe("問い合わせの分類"),
  wants_appointment: z.boolean().describe("打ち合わせ・デモ・訪問などアポイントを希望しているか"),
});

/**
 * メール本文から顧客・担当者・問い合わせ内容を抽出する。
 * ANTHROPIC_API_KEY があれば Claude で抽出し、無ければルールベースにフォールバックする。
 */
export async function extractFromEmail(opts: {
  fromName: string | null;
  fromAddress: string;
  subject: string | null;
  text: string;
}): Promise<Extracted> {
  const fallback = ruleBasedExtract(opts);
  if (!process.env.ANTHROPIC_API_KEY) return fallback;

  try {
    const client = new Anthropic();
    const form = parseFormNotification(opts.text || "");
    const body = (form ? opts.text || "" : stripQuotes(opts.text || "")).slice(0, 6000);
    const response = await client.messages.parse({
      model: "claude-opus-5",
      max_tokens: 2000,
      output_config: { effort: "low", format: zodOutputFormat(ExtractSchema) },
      system:
        "あなたは営業支援ツール(SFA)のメール解析エンジンです。受信した問い合わせメールから、問い合わせ者の会社・氏名・メールアドレス・役職・電話番号と、問い合わせ内容の要約・分類を抽出します。署名欄を重視し、推測が難しい項目は null にしてください。\n" +
        "自社サイトの問い合わせフォームの通知メール(「お名前:」「会社名:」「メールアドレス:」のようなラベル付きの本文)の場合、送信者(通知システム)ではなく本文に書かれた問い合わせ者本人の情報を抽出してください。",
      messages: [
        {
          role: "user",
          content: `From: ${opts.fromName ?? ""} <${opts.fromAddress}>\nSubject: ${opts.subject ?? ""}\n\n${body}`,
        },
      ],
    });
    const parsed = response.parsed_output;
    if (!parsed) return fallback;
    const email = parsed.person_email?.match(EMAIL_RE)?.[0]?.toLowerCase() ?? null;
    return {
      ...parsed,
      company_name: parsed.company_name ?? fallback.company_name,
      person_name: parsed.person_name ?? fallback.person_name,
      // フォーム通知は本文のラベルから取ったアドレスを正とする(モデルの読み違いを防ぐ)
      person_email: form?.email ?? email ?? fallback.person_email,
      phone: parsed.phone ?? fallback.phone,
    };
  } catch (e) {
    console.error("[extract] Claude extraction failed, falling back:", e);
    return fallback;
  }
}
