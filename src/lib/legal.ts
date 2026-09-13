/**
 * 法務ページ(利用規約・プライバシーポリシー・特定商取引法に基づく表記)で使う事業者情報。
 * 住所や連絡先が変わったらここだけ直す。
 */
export const OPERATOR = {
  name: "アートトレーディング株式会社",
  nameEn: "Art Trading Co., Ltd.",
  representative: "代表取締役 藤井 玲",
  postalCode: "170-0013",
  address: "東京都豊島区東池袋1-18-1 Hareza Tower 20F",
  tel: "03-5422-3348",
  email: "contact@art-trading.co.jp",
  businessHours: "10:00〜19:00(土日祝を除く)",
  website: "https://art-trading.co.jp/",
  /** 会社としてのプライバシーポリシー(本サービスのポリシーはこれを補完する) */
  corporatePrivacyUrl: "https://art-trading.co.jp/privacy-policy/",
} as const;

/** サービス名(メール文面の APP_NAME と同じ) */
export const SERVICE_NAME = "SFA";

/** 規約・ポリシーの制定日 */
export const LEGAL_EFFECTIVE_DATE = "2026年9月13日";

export const LEGAL_PAGES = [
  { href: "/legal/terms", label: "利用規約" },
  { href: "/legal/privacy", label: "プライバシーポリシー" },
  { href: "/legal/tokushoho", label: "特定商取引法に基づく表記" },
] as const;
