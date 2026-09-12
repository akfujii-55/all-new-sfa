import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/server";
import { applySubscriptionToTenant, getStripe, stripeConfigured } from "@/lib/stripe";
import { errorDetail, errorMessage, logSystem } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Stripe の Webhook。契約状態(サブスクリプション)の変化を tenants に写す。
 * Stripe ダッシュボードで「https://<ドメイン>/api/stripe/webhook」を登録し、署名シークレットを STRIPE_WEBHOOK_SECRET に設定する。
 * 受け取るイベント: checkout.session.completed, customer.subscription.created / updated / deleted, invoice.paid, invoice.payment_failed
 * 同じイベントの再送は stripe_events で弾く。
 */
export async function POST(request: NextRequest) {
  if (!stripeConfigured()) return NextResponse.json({ error: "stripe not configured" }, { status: 503 });
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "STRIPE_WEBHOOK_SECRET not configured" }, { status: 503 });

  const body = await request.text();
  const sig = request.headers.get("stripe-signature") ?? "";
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(body, sig, secret);
  } catch (e) {
    await logSystem({ level: "warn", source: "stripe.webhook", message: `署名の検証に失敗しました: ${errorMessage(e)}`, notify: false });
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error: dupErr } = await admin.from("stripe_events").insert({ id: event.id, type: event.type });
  if (dupErr) {
    if (dupErr.code === "23505") return NextResponse.json({ received: true, duplicate: true });
    await logSystem({ source: "stripe.webhook", message: `受信イベントの記録に失敗しました: ${dupErr.message}` });
    return NextResponse.json({ error: dupErr.message }, { status: 500 });
  }

  try {
    await handle(event);
    return NextResponse.json({ received: true });
  } catch (e) {
    // 500 を返すと Stripe が再送する。次回の処理のために受信記録は消す
    await admin.from("stripe_events").delete().eq("id", event.id);
    await logSystem({ source: "stripe.webhook", message: `${event.type} の処理に失敗しました: ${errorMessage(e)}`, detail: { ...errorDetail(e), event_id: event.id } });
    return NextResponse.json({ error: errorMessage(e) }, { status: 500 });
  }
}

async function handle(event: Stripe.Event) {
  const stripe = getStripe();
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      if (session.mode !== "subscription" || !session.subscription) return;
      const subId = typeof session.subscription === "string" ? session.subscription : session.subscription.id;
      const sub = await stripe.subscriptions.retrieve(subId);
      await applySubscriptionToTenant(sub);
      return;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      await applySubscriptionToTenant(event.data.object);
      return;
    }
    case "invoice.payment_failed": {
      const invoice = event.data.object;
      const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
      const { data: t } = customerId ? await createAdminClient().from("tenants").select("id, name, slug").eq("stripe_customer_id", customerId).maybeSingle() : { data: null };
      await logSystem({
        source: "stripe.payment_failed",
        message: `お支払いに失敗しました: ${t ? `${t.name}(${t.slug})` : customerId ?? "不明"} 請求書 ${invoice.id} ${invoice.amount_due != null ? `${invoice.amount_due.toLocaleString("ja-JP")} 円` : ""}`,
        detail: { invoice: invoice.id, customer: customerId, tenant_id: t?.id ?? null, attempt: invoice.attempt_count },
      });
      // サブスクリプションの状態(past_due)は customer.subscription.updated で反映される
      return;
    }
    case "invoice.paid": {
      const invoice = event.data.object;
      const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
      await logSystem({
        level: "info",
        source: "stripe.invoice_paid",
        message: `お支払いを確認しました: 顧客 ${customerId ?? "不明"} 請求書 ${invoice.id} ${invoice.amount_paid != null ? `${invoice.amount_paid.toLocaleString("ja-JP")} 円` : ""}`,
        notify: false,
      });
      return;
    }
    default:
      return;
  }
}
