import { NextResponse } from "next/server";
import type Stripe from "stripe";
import {
  stripeSubscriptionIdFromInvoice,
  syncStripeSubscription,
} from "@/lib/billing/billing.server";
import { getStripeWebhookSecret } from "@/lib/billing/billingConfig";
import { getStripeClient } from "@/lib/billing/stripe.server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    const subscriptionId =
      typeof session.subscription === "string"
        ? session.subscription
        : session.subscription?.id;
    if (subscriptionId) {
      await syncStripeSubscription(
        await stripe.subscriptions.retrieve(subscriptionId)
      );
    }
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
