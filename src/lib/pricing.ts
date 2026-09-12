import { GIB, type Tenant } from "@/lib/types";

/** 運営側の料金・既定値(operator_settings)。値は円・日・件・GB */
export interface PricingSettings {
  /** 月額基本料金。メールアカウント 1、ユーザー 1、容量 1GB を含む */
  price_base_monthly: number;
  /** メールアカウント 1 件追加ごとの月額 */
  price_per_extra_mail_account: number;
  /** ユーザー 1 名追加ごとの月額 */
  price_per_extra_user: number;
  /** 容量 1GB 追加ごとの月額 */
  price_per_extra_storage_gb: number;
  /** お試し期間(日) */
  trial_days: number;
  default_max_users: number;
  default_max_mail_accounts: number;
  default_max_storage_gb: number;
}

export const DEFAULT_PRICING: PricingSettings = {
  price_base_monthly: 10000,
  price_per_extra_mail_account: 5000,
  price_per_extra_user: 1000,
  price_per_extra_storage_gb: 0,
  trial_days: 90,
  default_max_users: 1,
  default_max_mail_accounts: 1,
  default_max_storage_gb: 1,
};

export const PRICING_KEYS = Object.keys(DEFAULT_PRICING) as (keyof PricingSettings)[];

/** operator_settings の key/value 行から設定を組み立てる(欠けている・不正な値は既定値) */
export function pricingFromRows(rows: { key: string; value: string }[] | null | undefined): PricingSettings {
  const out = { ...DEFAULT_PRICING };
  for (const r of rows ?? []) {
    if (!(PRICING_KEYS as string[]).includes(r.key)) continue;
    const n = Number(r.value);
    if (Number.isFinite(n) && n >= 0) out[r.key as keyof PricingSettings] = n;
  }
  return out;
}

/** 基本料金に含まれる分(メールアカウント 1・ユーザー 1・容量 1GB)を超えた分の内訳と月額合計 */
export function monthlyFee(t: Pick<Tenant, "max_users" | "max_mail_accounts" | "max_storage_bytes">, p: PricingSettings) {
  const extraMail = Math.max(0, t.max_mail_accounts - 1);
  const extraUsers = Math.max(0, t.max_users - 1);
  const extraGb = Math.max(0, Math.ceil(t.max_storage_bytes / GIB) - 1);
  const items = [
    { label: "基本料金", qty: 1, unit: p.price_base_monthly, amount: p.price_base_monthly },
    { label: "メールアカウント追加", qty: extraMail, unit: p.price_per_extra_mail_account, amount: extraMail * p.price_per_extra_mail_account },
    { label: "ユーザー追加", qty: extraUsers, unit: p.price_per_extra_user, amount: extraUsers * p.price_per_extra_user },
    { label: "容量追加(GB)", qty: extraGb, unit: p.price_per_extra_storage_gb, amount: extraGb * p.price_per_extra_storage_gb },
  ];
  return { items, total: items.reduce((a, i) => a + i.amount, 0) };
}

export function fmtGb(bytes: number) {
  const gb = bytes / GIB;
  return gb >= 10 ? `${gb.toFixed(0)} GB` : gb >= 1 ? `${gb.toFixed(1)} GB` : `${(bytes / 1024 / 1024).toFixed(0)} MB`;
}
