import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

export interface Extracted {
  company_name: string | null;
  person_name: string | null;
  person_title: string | null;
  phone: string | null;
  summary: string;
  category: string;
  wants_appointment: boolean;
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
    person_title: title,
    phone,
    summary,
    category,
    wants_appointment: wantsAppointment,
  };
}

const ExtractSchema = z.object({
  company_name: z.string().nullable().describe("送信者の所属会社名。不明なら null"),
  person_name: z.string().nullable().describe("送信者の氏名。不明なら null"),
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
    const body = stripQuotes(opts.text || "").slice(0, 6000);
    const response = await client.messages.parse({
      model: "claude-opus-5",
      max_tokens: 2000,
      output_config: { effort: "low", format: zodOutputFormat(ExtractSchema) },
      system:
        "あなたは営業支援ツール(SFA)のメール解析エンジンです。受信した問い合わせメールから、送信者の会社・氏名・役職・電話番号と、問い合わせ内容の要約・分類を抽出します。署名欄を重視し、推測が難しい項目は null にしてください。",
      messages: [
        {
          role: "user",
          content: `From: ${opts.fromName ?? ""} <${opts.fromAddress}>\nSubject: ${opts.subject ?? ""}\n\n${body}`,
        },
      ],
    });
    const parsed = response.parsed_output;
    if (!parsed) return fallback;
    return {
      ...parsed,
      company_name: parsed.company_name ?? fallback.company_name,
      person_name: parsed.person_name ?? fallback.person_name,
      phone: parsed.phone ?? fallback.phone,
    };
  } catch (e) {
    console.error("[extract] Claude extraction failed, falling back:", e);
    return fallback;
  }
}
