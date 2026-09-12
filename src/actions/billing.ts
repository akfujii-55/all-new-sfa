"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenant } from "@/lib/supabase/tenant";
import { getMyUsage } from "@/lib/tenant-quota";
import { applySubscriptionToTenant, createCheckoutSession, createPortalSession, getStripe, stripeConfigured, syncTenantBilling } from "@/lib/stripe";
import { errorDetail, errorMessage, logSystem } from "@/lib/log";

/**
 * テナント側の「ご契約・お支払い」。ログインユーザーなら誰でも操作できる(営業担当者は全員が管理者相当)。
 * Stripe とのやり取りは src/lib/stripe.ts に集約し、ここでは自テナントの確認とリダイレクトだけを行う。
 */

async function siteOrigin() {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
}

async function requireTenant() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("ログインが必要です");
  const tenant = await getCurrentTenant(supabase);
  if (!tenant) throw new Error("所属する会社(テナント)を確認できません");
  return { supabase, tenant, user: auth.user };
}

/** Stripe Checkout(契約開始)へ送る */
export async function startCheckout(): Promise<never> {
  if (!stripeConfigured()) throw new Error("オンライン決済は準備中です。運営にお問い合わせください");
  const { supabase, tenant, user } = await requireTenant();
  if (tenant.status === "suspended") throw new Error("このアカウントは利用停止中のため契約手続きができません。運営にお問い合わせください");
  if (tenant.stripe_subscription_id && tenant.billing_status !== "cancelled") throw new Error("既に契約済みです。お支払い方法の変更は「お支払い方法・請求書を管理」から行ってください");
  const usage = await getMyUsage(supabase);
  let url: string;
  try {
    url = await createCheckoutSession(tenant, usage, await siteOrigin());
  } catch (e) {
    await logSystem({ source: "stripe.checkout", message: `Checkout の作成に失敗しました: ${errorMessage(e)}`, detail: errorDetail(e), userEmail: user.email }, supabase);
    throw new Error("決済ページを開けませんでした。時間をおいてお試しいただくか、運営にお問い合わせください");
  }
  redirect(url);
}

/** Stripe カスタマーポータル(支払い方法・請求書・解約)へ送る */
export async function openBillingPortal(): Promise<never> {
  if (!stripeConfigured()) throw new Error("オンライン決済は準備中です。運営にお問い合わせください");
  const { supabase, tenant, user } = await requireTenant();
  if (!tenant.stripe_customer_id) throw new Error("まだ契約手続きが行われていません");
  let url: string;
  try {
    url = await createPortalSession(tenant.stripe_customer_id, `${await siteOrigin()}/settings/billing`);
  } catch (e) {
    await logSystem({ source: "stripe.portal", message: `カスタマーポータルを開けませんでした: ${errorMessage(e)}`, detail: errorDetail(e), userEmail: user.email }, supabase);
    throw new Error("お支払い管理ページを開けませんでした。時間をおいてお試しいただくか、運営にお問い合わせください");
  }
  redirect(url);
}

/**
 * Checkout 完了直後(success_url)に契約状態を tenants へ写す。
 * Webhook でも同じ処理が走るが、Webhook が遅れても画面がすぐ「契約中」になるようにする。
 */
export async function finalizeCheckout(sessionId: string): Promise<{ ok: boolean; message: string }> {
  if (!stripeConfigured()) return { ok: false, message: "オンライン決済は準備中です" };
  const { tenant } = await requireTenant();
  try {
    const session = await getStripe().checkout.sessions.retrieve(sessionId, { expand: ["subscription"] });
    if (session.metadata?.tenant_id !== tenant.id) return { ok: false, message: "この決済は別の会社のものです" };
    const sub = session.subscription;
    if (!sub || typeof sub === "string") return { ok: false, message: "契約情報をまだ取得できません。しばらくしてから画面を更新してください" };
    await applySubscriptionToTenant(sub);
    await syncTenantBilling(tenant.id);
    revalidatePath("/", "layout");
    return { ok: true, message: "お支払い方法を登録しました" };
  } catch (e) {
    await logSystem({ source: "stripe.checkout", message: `Checkout 完了の反映に失敗しました: ${errorMessage(e)}`, detail: errorDetail(e) });
    return { ok: false, message: "契約情報の反映に時間がかかっています。しばらくしてから画面を更新してください" };
  }
}
