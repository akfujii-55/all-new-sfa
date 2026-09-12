import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/server";
import { errorDetail, errorMessage, logSystem } from "@/lib/log";
import { pricingFromRows, TAX_PERCENT, type PricingSettings } from "@/lib/pricing";
import { GIB, type BillingStatus, type Tenant, type TenantStatus, type TenantUsage } from "@/lib/types";

/**
 * Stripe Billing 連携。
 *
 * - 料金は運営管理の「料金・既定値」(operator_settings)が正。Stripe 側の商品は初回に自動作成して ID を operator_settings に控え、
 *   価格(Price)は「その商品 × 単価 × 月額 × 円」が一致する有効なものを探して無ければ作る。運営が単価を変えると次の同期から新しい価格になる。
 * - 請求は「基本料金 1 + ユーザー追加 n + メールアカウント追加 n(+ 容量追加 n)」の数量課金。pricing.ts の monthlyFee と同じ計算。
 *   招待・削除・メールアカウント追加などのたびに syncTenantBilling で数量を Stripe に反映する(日割りは Stripe に任せる)。
 * - テナントの契約状態は Webhook(/api/stripe/webhook)で tenants に写す。Checkout 完了直後は finalize でも写す。
 * - 環境変数: STRIPE_SECRET_KEY(必須)、STRIPE_WEBHOOK_SECRET(Webhook 検証)。未設定なら課金機能は「準備中」として画面で案内する。
 */

export function stripeConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function stripeWebhookConfigured() {
  return Boolean(process.env.STRIPE_WEBHOOK_SECRET);
}

let client: Stripe | null = null;
export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY が設定されていないため、オンライン決済を利用できません。運営にお問い合わせください");
  if (!client) client = new Stripe(key, { typescript: true });
  return client;
}

/** テストモードのキーかどうか(ダッシュボードのリンク用) */
export function stripeIsTestMode() {
  return (process.env.STRIPE_SECRET_KEY ?? "").startsWith("sk_test_");
}

export function stripeDashboardUrl(path: string) {
  return `https://dashboard.stripe.com/${stripeIsTestMode() ? "test/" : ""}${path.replace(/^\//, "")}`;
}

// ---------- 商品と価格 ----------

export type PriceKind = "base" | "user" | "mail_account" | "storage_gb";

const PRODUCT_META: Record<PriceKind, { settingKey: string; name: string; description: string; pricingKey: keyof PricingSettings }> = {
  base: { settingKey: "stripe_product_base", name: "SFA 基本料金", description: "メールアカウント 1 件・ユーザー 1 名・容量 1GB を含む月額基本料金", pricingKey: "price_base_monthly" },
  user: { settingKey: "stripe_product_user", name: "SFA ユーザー追加", description: "ログインユーザー 1 名追加ごとの月額", pricingKey: "price_per_extra_user" },
  mail_account: { settingKey: "stripe_product_mail_account", name: "SFA メールアカウント追加", description: "連携メールアカウント 1 件追加ごとの月額", pricingKey: "price_per_extra_mail_account" },
  storage_gb: { settingKey: "stripe_product_storage_gb", name: "SFA 容量追加(GB)", description: "使用容量 1GB 追加ごとの月額", pricingKey: "price_per_extra_storage_gb" },
};

const productCache = new Map<PriceKind, string>();
const priceCache = new Map<string, string>();

async function loadPricing(): Promise<PricingSettings> {
  const { data } = await createAdminClient().from("operator_settings").select("key, value");
  return pricingFromRows(data as { key: string; value: string }[] | null);
}

/** 商品 ID。operator_settings に控えが無ければ Stripe に作って保存する */
async function ensureProduct(kind: PriceKind): Promise<string> {
  const cached = productCache.get(kind);
  if (cached) return cached;
  const meta = PRODUCT_META[kind];
  const admin = createAdminClient();
  const stripe = getStripe();
  const { data: row } = await admin.from("operator_settings").select("value").eq("key", meta.settingKey).maybeSingle();
  let id = (row?.value as string | undefined) || "";
  if (id) {
    // テストモード→本番などキーを切り替えた場合は控えの商品が存在しないので作り直す
    try {
      const p = await stripe.products.retrieve(id);
      if (!p.active) id = "";
    } catch {
      id = "";
    }
  }
  if (!id) {
    const p = await stripe.products.create({ name: meta.name, description: meta.description, metadata: { sfa_kind: kind } });
    id = p.id;
    await admin.from("operator_settings").upsert({ key: meta.settingKey, value: id }, { onConflict: "key" });
  }
  productCache.set(kind, id);
  return id;
}

/** 商品 × 単価に一致する月額(円)の価格 ID。無ければ作る */
async function ensurePrice(kind: PriceKind, unitAmount: number): Promise<string> {
  const product = await ensureProduct(kind);
  const cacheKey = `${product}:${unitAmount}`;
  const cached = priceCache.get(cacheKey);
  if (cached) return cached;
  const stripe = getStripe();
  const list = await stripe.prices.list({ product, active: true, currency: "jpy", type: "recurring", limit: 100 });
  let price = list.data.find((p) => p.unit_amount === unitAmount && p.recurring?.interval === "month" && p.recurring.interval_count === 1 && p.recurring.usage_type === "licensed");
  if (!price) {
    price = await stripe.prices.create({
      product,
      currency: "jpy",
      unit_amount: unitAmount,
      recurring: { interval: "month" },
      nickname: `${PRODUCT_META[kind].name} ${unitAmount} 円/月`,
      metadata: { sfa_kind: kind },
    });
  }
  priceCache.set(cacheKey, price.id);
  return price.id;
}

let taxRateCache: string | null = null;

/** 消費税 10%(外税)の Tax Rate。operator_settings に控え、無ければ既存の同率のものを探して、それも無ければ作る */
export async function ensureTaxRate(): Promise<string> {
  if (taxRateCache) return taxRateCache;
  const admin = createAdminClient();
  const stripe = getStripe();
  const key = `stripe_tax_rate_${TAX_PERCENT}`;
  const { data: row } = await admin.from("operator_settings").select("value").eq("key", key).maybeSingle();
  let id = (row?.value as string | undefined) || "";
  if (id) {
    try {
      const r = await stripe.taxRates.retrieve(id);
      if (!r.active || r.percentage !== TAX_PERCENT || r.inclusive) id = "";
    } catch {
      id = "";
    }
  }
  if (!id) {
    const list = await stripe.taxRates.list({ active: true, inclusive: false, limit: 100 });
    id = list.data.find((r) => r.percentage === TAX_PERCENT && r.country === "JP")?.id ?? "";
  }
  if (!id) {
    const r = await stripe.taxRates.create({ display_name: "消費税", percentage: TAX_PERCENT, inclusive: false, country: "JP", description: `消費税 ${TAX_PERCENT}%`, metadata: { sfa: "consumption_tax" } });
    id = r.id;
  }
  await admin.from("operator_settings").upsert({ key, value: id }, { onConflict: "key" });
  taxRateCache = id;
  return id;
}

export interface BillingLine {
  kind: PriceKind;
  price: string;
  quantity: number;
}

/** 現在の利用数から Stripe に載せる明細(数量 0 の明細は含めない) */
export async function billingLinesFor(usage: Pick<TenantUsage, "users" | "mail_accounts" | "storage_bytes">, pricing: PricingSettings): Promise<BillingLine[]> {
  const wanted: { kind: PriceKind; quantity: number; unit: number }[] = [
    { kind: "base", quantity: 1, unit: pricing.price_base_monthly },
    { kind: "user", quantity: Math.max(0, usage.users - 1), unit: pricing.price_per_extra_user },
    { kind: "mail_account", quantity: Math.max(0, usage.mail_accounts - 1), unit: pricing.price_per_extra_mail_account },
    { kind: "storage_gb", quantity: Math.max(0, Math.ceil(usage.storage_bytes / GIB) - 1), unit: pricing.price_per_extra_storage_gb },
  ];
  const lines: BillingLine[] = [];
  for (const w of wanted) {
    // 単価 0 のオプションは Stripe に載せない(請求書を汚さない)
    if (w.quantity <= 0 || (w.kind !== "base" && w.unit <= 0)) continue;
    lines.push({ kind: w.kind, price: await ensurePrice(w.kind, w.unit), quantity: w.quantity });
  }
  return lines;
}

// ---------- 顧客・Checkout・ポータル ----------

/** テナントに対応する Stripe の顧客。無ければ作って tenants に控える */
export async function ensureCustomer(tenant: Pick<Tenant, "id" | "name" | "slug" | "contact_email" | "contact_name" | "stripe_customer_id">): Promise<string> {
  const stripe = getStripe();
  const admin = createAdminClient();
  if (tenant.stripe_customer_id) {
    try {
      const c = await stripe.customers.retrieve(tenant.stripe_customer_id);
      if (!c.deleted) return c.id;
    } catch {
      // 別モードのキーに切り替えた等で存在しない → 作り直す
    }
  }
  const c = await stripe.customers.create({
    name: tenant.name,
    email: tenant.contact_email ?? undefined,
    description: `会社 ID: ${tenant.slug}`,
    metadata: { tenant_id: tenant.id, tenant_slug: tenant.slug, contact_name: tenant.contact_name ?? "" },
  });
  const { error } = await admin.from("tenants").update({ stripe_customer_id: c.id }).eq("id", tenant.id);
  if (error) throw new Error(`Stripe の顧客 ID を保存できません: ${error.message}`);
  return c.id;
}

/**
 * 契約開始の Checkout セッション(サブスクリプション)。
 * お試し期間が 2 日以上残っていれば trial_end を付けて、課金開始をお試し終了日にする。
 */
export async function createCheckoutSession(tenant: Tenant, usage: TenantUsage, origin: string): Promise<string> {
  const stripe = getStripe();
  const pricing = await loadPricing();
  const customer = await ensureCustomer(tenant);
  const lines = await billingLinesFor(usage, pricing);
  const taxRate = await ensureTaxRate();
  const trialEnd = tenant.status === "trial" && tenant.trial_ends_at ? Math.floor(Date.parse(tenant.trial_ends_at) / 1000) : null;
  const minTrialEnd = Math.floor(Date.now() / 1000) + 48 * 60 * 60;
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer,
    locale: "ja",
    line_items: lines.map((l) => ({ price: l.price, quantity: l.quantity })),
    subscription_data: {
      metadata: { tenant_id: tenant.id, tenant_slug: tenant.slug },
      // 税抜価格に消費税を上乗せする(Checkout と以後の請求書の両方に付く)
      default_tax_rates: [taxRate],
      ...(trialEnd && trialEnd > minTrialEnd ? { trial_end: trialEnd } : {}),
    },
    metadata: { tenant_id: tenant.id },
    customer_update: { name: "auto", address: "auto" },
    billing_address_collection: "auto",
    allow_promotion_codes: true,
    success_url: `${origin}/settings/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/settings/billing?checkout=cancel`,
  });
  if (!session.url) throw new Error("Stripe の決済ページを作成できませんでした");
  return session.url;
}

/** 支払い方法・請求書・解約を扱う Stripe カスタマーポータル */
export async function createPortalSession(customerId: string, returnUrl: string): Promise<string> {
  const session = await getStripe().billingPortal.sessions.create({ customer: customerId, return_url: returnUrl, locale: "ja" });
  return session.url;
}

// ---------- Stripe の契約状態を tenants に写す ----------

function periodEndOf(sub: Stripe.Subscription): string | null {
  // 2025-03 以降の API では current_period_end はサブスクリプション項目側にある
  const item = sub.items.data[0] as (Stripe.SubscriptionItem & { current_period_end?: number }) | undefined;
  const legacy = (sub as unknown as { current_period_end?: number }).current_period_end;
  const sec = item?.current_period_end ?? legacy;
  return sec ? new Date(sec * 1000).toISOString() : null;
}

/** Stripe の subscription.status → tenants の契約状態・課金状態。null は tenants を変えない(未完了の Checkout など) */
export function mapSubscriptionStatus(status: Stripe.Subscription.Status): { status: TenantStatus; billing: BillingStatus } | null {
  switch (status) {
    case "trialing":
      return { status: "trial", billing: "trialing" };
    case "active":
      return { status: "active", billing: "active" };
    case "past_due":
      // 支払い遅延中も Stripe が再試行するあいだは利用を止めない
      return { status: "active", billing: "past_due" };
    case "unpaid":
      return { status: "suspended", billing: "past_due" };
    case "canceled":
      return { status: "cancelled", billing: "cancelled" };
    case "paused":
      return { status: "suspended", billing: "past_due" };
    default:
      return null;
  }
}

/** サブスクリプションの内容を tenants に反映する。テナントは metadata.tenant_id → 顧客 ID の順で特定 */
export async function applySubscriptionToTenant(sub: Stripe.Subscription): Promise<string | null> {
  const admin = createAdminClient();
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  let tenantId = sub.metadata?.tenant_id || null;
  if (!tenantId) {
    const { data } = await admin.from("tenants").select("id").eq("stripe_customer_id", customerId).maybeSingle();
    tenantId = (data?.id as string | undefined) ?? null;
  }
  if (!tenantId) {
    await logSystem({ level: "warn", source: "stripe.webhook", message: `テナントを特定できないサブスクリプションです: ${sub.id}(顧客 ${customerId})` });
    return null;
  }
  const mapped = mapSubscriptionStatus(sub.status);
  const values: Record<string, unknown> = {
    stripe_customer_id: customerId,
    stripe_subscription_id: sub.status === "canceled" ? null : sub.id,
    stripe_subscription_status: sub.status,
    current_period_end: periodEndOf(sub),
    cancel_at_period_end: sub.cancel_at_period_end,
  };
  if (mapped) {
    values.status = mapped.status;
    values.billing_status = mapped.billing;
    // Stripe 側でお試し中なら、その終了日をお試し期限にそろえる
    if (sub.status === "trialing" && sub.trial_end) values.trial_ends_at = new Date(sub.trial_end * 1000).toISOString();
  }
  // 停止中のテナントは運営が手で解除するまで Stripe の状態で上書きしない(運営による停止を優先)
  const { data: current } = await admin.from("tenants").select("status, stripe_subscription_id").eq("id", tenantId).single();
  if (current?.status === "suspended" && mapped && mapped.status !== "suspended" && current.stripe_subscription_id === sub.id) {
    delete values.status;
  }
  const { error } = await admin.from("tenants").update(values).eq("id", tenantId);
  if (error) throw new Error(`tenants の更新に失敗しました: ${error.message}`);
  return tenantId;
}

// ---------- 数量の同期 ----------

/**
 * テナントの現在の利用数を Stripe のサブスクリプション数量に反映する。
 * 契約前(サブスクリプション無し)や Stripe 未設定なら何もしない。失敗は system_logs に記録して例外は投げない。
 */
export async function syncTenantBilling(tenantId: string): Promise<void> {
  if (!stripeConfigured()) return;
  const admin = createAdminClient();
  try {
    const { data: tenant } = await admin.from("tenants").select("id, slug, stripe_subscription_id").eq("id", tenantId).maybeSingle();
    if (!tenant?.stripe_subscription_id) return;
    const { data: usageRow, error: usageErr } = await admin.rpc("tenant_usage_of", { p_tenant: tenantId }).single();
    if (usageErr) throw new Error(usageErr.message);
    const u = usageRow as Record<string, number | string>;
    const usage = { users: Number(u.users ?? 0), mail_accounts: Number(u.mail_accounts ?? 0), storage_bytes: Number(u.storage_bytes ?? 0) };
    const pricing = await loadPricing();
    const wanted = await billingLinesFor(usage, pricing);

    const stripe = getStripe();
    const sub = await stripe.subscriptions.retrieve(tenant.stripe_subscription_id as string);
    if (sub.status === "canceled" || sub.status === "incomplete_expired") return;

    const items: Stripe.SubscriptionUpdateParams.Item[] = [];
    const seen = new Set<string>();
    for (const it of sub.items.data) {
      const w = wanted.find((l) => l.price === it.price.id);
      if (w) {
        seen.add(w.price);
        if (it.quantity !== w.quantity) items.push({ id: it.id, quantity: w.quantity });
      } else {
        // 単価が変わった/数量が 0 になった明細は外す(同じ商品の新単価は下で追加される)
        items.push({ id: it.id, deleted: true });
      }
    }
    for (const w of wanted) if (!seen.has(w.price)) items.push({ price: w.price, quantity: w.quantity });
    // 消費税の Tax Rate が付いていない契約(運営が Stripe 側で作った等)には付ける
    const taxRate = await ensureTaxRate();
    const hasTax = (sub.default_tax_rates ?? []).some((r) => r.id === taxRate);
    if (items.length === 0 && hasTax) return;
    await stripe.subscriptions.update(sub.id, {
      ...(items.length > 0 ? { items } : {}),
      ...(hasTax ? {} : { default_tax_rates: [taxRate] }),
      proration_behavior: "create_prorations",
    });
  } catch (e) {
    await logSystem({ source: "stripe.sync", message: `Stripe の数量同期に失敗しました(テナント ${tenantId}): ${errorMessage(e)}`, detail: errorDetail(e) });
  }
}
