/**
 * 選択中のテナント(1 つのログインで複数のテナントに入れる運営サポート用)。
 * Cookie の値を x-sfa-tenant ヘッダーで DB に伝え、current_tenant_id() がそのテナントに入れる利用者かを確かめて切り替える。
 * 入れないテナントの ID を送っても DB 側で無視され、元の所属に戻るだけなので、Cookie は秘密ではない
 * (ブラウザのクライアントも読むので httpOnly にしない)。クライアント部品からも読むのでサーバー専用のものを import しない。
 */
export const TENANT_COOKIE = "sfa_tenant";
export const TENANT_HEADER = "x-sfa-tenant";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Cookie の値から付けるリクエストヘッダー。値が無い・形が違うときは何も付けない */
export function tenantHeaders(cookieValue: string | null | undefined): Record<string, string> {
  return cookieValue && UUID_RE.test(cookieValue) ? { [TENANT_HEADER]: cookieValue } : {};
}

/** 入れるテナント(DB 関数 my_tenants の 1 行) */
export interface TenantOption {
  id: string;
  name: string;
  is_home: boolean;
  is_current: boolean;
}
