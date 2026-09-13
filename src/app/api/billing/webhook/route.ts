import { NextResponse } from "next/server";
import type Stripe from "stripe";
import {
  stripeSubscriptionIdFromInvoice,
  syncStripeSubscription,
} from "@/lib/billing/billing.server";
import { getStripeWebhookSecret } from "@/lib/billing/billingConfig";
import {
  getCreditPack,
  getCreditPackByStripePriceId,
} from "@/lib/billing/creditPackCatalog";
import { getStripeClient } from "@/lib/billing/stripe.server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function stripeId(value: string | { id: string } | null | undefined): string | null {
  if (typeof value === "string") return value;
  if (value && typeof value.id === "string") return value.id;
  return null;
}

async function processCreditCheckoutSession(
  session: Stripe.Checkout.Session
): Promise<boolean> {
  if (session.mode !== "payment" || session.metadata?.libread_kind !== "credit_pack") {
    return false;
  }
  if (session.payment_status !== "paid") {
    return true;
  }

  const stripe = getStripeClient();
  const hydrated = await stripe.checkout.sessions.retrieve(session.id, {
    expand: ["line_items.data.price"],
  });
  const packId = hydrated.metadata?.pack_id?.trim() ?? "";
  const userId = hydrated.metadata?.libread_user_id?.trim() ?? "";
  if (!packId || !userId || hydrated.client_reference_id !== userId) {
    throw new Error("Credit checkout user/pack metadata mismatch");
  }
  const lines = hydrated.line_items?.data ?? [];
  if (lines.length !== 1 || lines[0]?.quantity !== 1) {
    throw new Error("Credit checkout must contain exactly one catalog price");
  }
  const priceId = stripeId(lines[0]?.price ?? null);
  const byPack = getCreditPack(packId);
  const byPrice = priceId ? getCreditPackByStripePriceId(priceId) : null;
  if (!byPack || !byPrice || byPack.id !== byPrice.id || byPack.stripePriceId !== priceId) {
    throw new Error("Credit checkout price does not match server-side catalog");
  }

  const paymentIntentId = stripeId(hydrated.payment_intent);
  if (!paymentIntentId) throw new Error("Paid credit checkout is missing payment_intent");
  const purchasedAtMs = hydrated.created * 1000;
  const expiresAt = new Date(
    purchasedAtMs + byPack.expiresInDays * 24 * 60 * 60 * 1000
  ).toISOString();
  const admin = createAdminClient();
  const { error } = await admin.rpc("grant_credit_purchase", {
    p_user_id: userId,
    p_pack_id: byPack.id,
    p_checkout_session_id: hydrated.id,
    p_payment_intent_id: paymentIntentId,
    p_credits: byPack.credits,
    p_expires_at: expiresAt,
    p_idempotency_key: `stripe_checkout:${hydrated.id}`,
    p_metadata: {
      stripe_price_id: byPack.stripePriceId,
      display_price_jpy: byPack.displayPriceJpy,
      currency: byPack.currency,
    },
  });
  if (error) throw new Error(`Credit grant failed: ${error.message}`);
  return true;
}

async function reverseCreditPurchase(args: {
  paymentIntentId: string;
  eventKey: string;
  type: "refund" | "dispute";
}) {
  const admin = createAdminClient();
  const { error } = await admin.rpc("reverse_credit_purchase_full", {
    p_payment_intent_id: args.paymentIntentId,
    p_stripe_event_key: args.eventKey,
    p_reversal_type: args.type,
  });
  if (error) throw new Error(`Credit ${args.type} reversal failed: ${error.message}`);
}

async function processEvent(event: Stripe.Event): Promise<void> {
  const stripe = getStripeClient();

  if (
    event.type === "customer.subscription.created" ||
    event.type === "customer.subscription.updated"
  ) {
    const eventSubscription = event.data.object as Stripe.Subscription;
    await syncStripeSubscription(
      await stripe.subscriptions.retrieve(eventSubscription.id)
    );
    return;
  }

  if (event.type === "customer.subscription.deleted") {
    await syncStripeSubscription(event.data.object as Stripe.Subscription);
    return;
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    if (await processCreditCheckoutSession(session)) return;
    const subscriptionId = stripeId(session.subscription);
    if (subscriptionId) {
      await syncStripeSubscription(
        await stripe.subscriptions.retrieve(subscriptionId)
      );
    }
    return;
  }

  if (event.type === "checkout.session.async_payment_succeeded") {
    await processCreditCheckoutSession(event.data.object as Stripe.Checkout.Session);
    return;
  }

  if (event.type === "charge.refunded") {
    const charge = event.data.object as Stripe.Charge;
    // Do not guess a discrete-credit rule for partial refunds. Stripe's `refunded`
    // flag is true only when the charge has been fully refunded.
    if (!charge.refunded) return;
    const paymentIntentId = stripeId(charge.payment_intent);
    if (paymentIntentId) {
      await reverseCreditPurchase({
        paymentIntentId,
        eventKey: event.id,
        type: "refund",
      });
    }
    return;
  }

  if (event.type === "charge.dispute.created") {
    const dispute = event.data.object as Stripe.Dispute;
    const chargeId = stripeId(dispute.charge);
    if (!chargeId) return;
    const charge = await stripe.charges.retrieve(chargeId);
    const paymentIntentId = stripeId(charge.payment_intent);
    if (paymentIntentId) {
      await reverseCreditPurchase({
        paymentIntentId,
        eventKey: event.id,
        type: "dispute",
      });
    }
    return;
  }

  if (event.type === "charge.dispute.closed") {
    // The event itself is retained by libread_stripe_webhook_events. A won dispute
    // requires an explicit compensating grant policy before credits are restored;
    // never mutate or delete the original negative ledger entry.
    return;
  }

  if (event.type === "invoice.paid" || event.type === "invoice.payment_failed") {
    const subscriptionId = stripeSubscriptionIdFromInvoice(
      event.data.object as Stripe.Invoice
    );
    if (subscriptionId) {
      await syncStripeSubscription(
        await stripe.subscriptions.retrieve(subscriptionId)
      );
    }
  }
}

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    const rawBody = await request.text();
    event = await getStripeClient().webhooks.constructEventAsync(
      rawBody,
      signature,
      getStripeWebhookSecret()
    );
  } catch (signatureError) {
    console.error("[billing-webhook-signature]", signatureError);
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const admin = createAdminClient();
  const existing = await admin
    .from("libread_stripe_webhook_events")
    .select("processed_at")
    .eq("event_id", event.id)
    .maybeSingle();
  if (existing.data?.processed_at) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  await admin.from("libread_stripe_webhook_events").upsert(
    {
      event_id: event.id,
      event_type: event.type,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "event_id" }
  );

  try {
    await processEvent(event);
    const { error } = await admin
      .from("libread_stripe_webhook_events")
      .update({
        processed_at: new Date().toISOString(),
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("event_id", event.id);
    if (error) throw error;
    return NextResponse.json({ received: true });
  } catch (processingError) {
    console.error("[billing-webhook-process]", processingError);
    await admin
      .from("libread_stripe_webhook_events")
      .update({
        last_error:
          processingError instanceof Error
            ? processingError.message.slice(0, 1_000)
            : "unknown",
        updated_at: new Date().toISOString(),
      })
      .eq("event_id", event.id);
    return NextResponse.json({ received: false }, { status: 500 });
  }
}
