import type { Tenant, TenantUsageType } from "@/lib/types";

/**
 * 利用タイプ(tenants.usage_type、0038)ごとに出す機能。
 * メール管理(mail)は複数のメールアカウントと問い合わせの管理に使うので、案件(カンバン)と売上を出さない。
 * 行動(Todo)は問い合わせからも作れる(0039)ので、どちらの利用タイプでも使う。
 * データは消さず表示と操作の入口だけを閉じる(運営管理で営業支援に戻せば元のまま見える)。
 * クライアント部品からも読むので、サーバー専用のものを import しない(サーバー側の取得は features-server.ts)。
 */
export interface Features {
  usageType: TenantUsageType;
  /** 営業の機能: 案件(カンバン)・売上、ダッシュボードの売上とパイプライン、問い合わせの案件化。行動(Todo)は含まない */
  sales: boolean;
}

export function featuresOf(t: Pick<Tenant, "usage_type"> | null | undefined): Features {
  const usageType: TenantUsageType = t?.usage_type === "mail" ? "mail" : "sfa";
  return { usageType, sales: usageType === "sfa" };
}

/** 営業の機能が無いテナントでは直接開けないパス(メニューから消すだけでなく、URL を直に開いても出さない) */
export const SALES_PATHS = ["/deals", "/revenue"];
