import "server-only";

import type Stripe from "stripe";
import {
  getStripePriceId,
  LIBREAD_SUBSCRIPTION_PRICE_JPY,
} from "@/lib/billing/billingConfig";
import { getStripeClient } from "@/lib/billing/stripe.server";
import { createAdminClient } from "@/lib/supabase/admin";

const ENTITLED_STATUSES = new Set<Stripe.Subscription.Status>([
  "active",
  "trialing",
]);

const BLOCKING_CHECKOUT_STATUSES = new Set<Stripe.Subscription.Status>([
  "active",
  "trialing",
  "past_due",
  "unpaid",
  "paused",
  "incomplete",
]);

export type BillingSubscriptionSummary = {
  status: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  isEntitled: boolean;
};

function customerId(value: Stripe.Subscription["customer"]): string {
  return typeof value === "string" ? value : value.id;
}

function subscriptionPriceId(subscription: Stripe.Subscription): string {
  return subscription.items.data[0]?.price?.id ?? "";
}

function subscriptionPeriodEnd(subscription: Stripe.Subscription): string | null {
  const timestamps = subscription.items.data
    .map((item) => item.current_period_end)
    .filter((value) => Number.isFinite(value) && value > 0);
  const timestamp = timestamps.length > 0 ? Math.max(...timestamps) : null;
  return timestamp ? new Date(timestamp * 1000).toISOString() : null;
}

export async function getBillingSubscriptionSummary(
  userId: string
): Promise<BillingSubscriptionSummary | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("libread_billing_subscriptions")
    .select("status, current_period_end, cancel_at_period_end, stripe_price_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) return null;
  const configuredPriceId = process.env.STRIPE_PRICE_ID?.trim() ?? "";
  return {
    status: String(data.status ?? ""),
    currentPeriodEnd:
      typeof data.current_period_end === "string"
        ? data.current_period_end
        : null,
    cancelAtPeriodEnd: data.cancel_at_period_end === true,
    isEntitled:
      ENTITLED_STATUSES.has(data.status as Stripe.Subscription.Status) &&
      Boolean(configuredPriceId) &&
      data.stripe_price_id === configuredPriceId,
  };
}

export async function getBillingCustomerId(
  userId: string
): Promise<string | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("libread_billing_customers")
    .select("stripe_customer_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`課金利用者の確認に失敗しました: ${error.message}`);
  if (!data?.stripe_customer_id) return null;
  return String(data.stripe_customer_id);
}

export async function getOrCreateBillingCustomer(args: {
  userId: string;
  email: string;
}): Promise<string> {
  const existing = await getBillingCustomerId(args.userId);
  const stripe = getStripeClient();
  if (existing) {
    await stripe.customers.update(existing, {
      email: args.email,
      metadata: { libread_user_id: args.userId },
    });
    return existing;
  }

  const customer = await stripe.customers.create({
    email: args.email,
    metadata: { libread_user_id: args.userId },
  });
  const admin = createAdminClient();
  const { error } = await admin.from("libread_billing_customers").upsert(
    {
      user_id: args.userId,
      stripe_customer_id: customer.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );
  if (error) throw new Error(`課金利用者の保存に失敗しました: ${error.message}`);
  return customer.id;
}

export async function findBlockingSubscription(
  stripeCustomerId: string
): Promise<Stripe.Subscription | null> {
  const stripe = getStripeClient();
  const subscriptions = await stripe.subscriptions.list({
    customer: stripeCustomerId,
    status: "all",
    limit: 100,
  });
  return (
    subscriptions.data.find((subscription) =>
      BLOCKING_CHECKOUT_STATUSES.has(subscription.status)
    ) ?? null
  );
}

export async function findOpenCheckoutSession(
  stripeCustomerId: string
): Promise<Stripe.Checkout.Session | null> {
  const stripe = getStripeClient();
  const sessions = await stripe.checkout.sessions.list({
    customer: stripeCustomerId,
    limit: 10,
  });
  return (
    sessions.data.find(
      (session) =>
        session.mode === "subscription" &&
        session.status === "open" &&
        Boolean(session.url)
    ) ?? null
  );
}

export async function verifyConfiguredStripePrice(): Promise<void> {
  const stripe = getStripeClient();
  const price = await stripe.prices.retrieve(getStripePriceId());
  if (
    !price.active ||
    price.currency !== "jpy" ||
    price.unit_amount !== LIBREAD_SUBSCRIPTION_PRICE_JPY ||
    price.recurring?.interval !== "month" ||
    price.recurring.interval_count !== 1 ||
    price.tax_behavior !== "inclusive"
  ) {
    throw new Error(
      "Stripe Priceは税込680円・日本円・月額・tax_behavior=inclusiveで作成してください。"
    );
  }
}

async function resolveSubscriptionUserId(
  subscription: Stripe.Subscription
): Promise<string | null> {
  const metadataUserId = subscription.metadata.libread_user_id?.trim();
  if (metadataUserId) return metadataUserId;

  const admin = createAdminClient();
  const { data } = await admin
    .from("libread_billing_customers")
    .select("user_id")
    .eq("stripe_customer_id", customerId(subscription.customer))
    .maybeSingle();
  return data?.user_id ? String(data.user_id) : null;
}

export async function syncStripeSubscription(
  subscription: Stripe.Subscription
): Promise<void> {
  const userId = await resolveSubscriptionUserId(subscription);
  if (!userId) throw new Error("Stripe契約に対応するLIB read利用者が見つかりません。");

  const priceId = subscriptionPriceId(subscription);
  const expectedPriceId = getStripePriceId();
  const periodEnd = subscriptionPeriodEnd(subscription);
  const isEntitled =
    priceId === expectedPriceId &&
    ENTITLED_STATUSES.has(subscription.status) &&
    Boolean(periodEnd);
  const now = new Date().toISOString();
  const admin = createAdminClient();

  const [subscriptionResult, entitlementResult] = await Promise.all([
    admin.from("libread_billing_subscriptions").upsert(
      {
        user_id: userId,
        stripe_customer_id: customerId(subscription.customer),
        stripe_subscription_id: subscription.id,
        stripe_price_id: priceId || "unknown",
        status: subscription.status,
        current_period_end: periodEnd,
        cancel_at_period_end: subscription.cancel_at_period_end,
        updated_at: now,
      },
      { onConflict: "user_id" }
    ),
    admin.from("libread_user_entitlements").upsert(
      {
        user_id: userId,
        plan_type: isEntitled ? "subscriber" : "free",
        subscriber_until: isEntitled ? periodEnd : null,
        updated_at: now,
      },
      { onConflict: "user_id" }
    ),
  ]);

  if (subscriptionResult.error) {
    throw new Error(`契約状態の保存に失敗しました: ${subscriptionResult.error.message}`);
  }
  if (entitlementResult.error) {
    throw new Error(`有料権限の更新に失敗しました: ${entitlementResult.error.message}`);
  }
}

export async function cancelSubscriptionsBeforeAccountDeletion(
  userId: string
): Promise<void> {
  const stripeCustomerId = await getBillingCustomerId(userId);
  if (!stripeCustomerId) return;

  const stripe = getStripeClient();
  const subscriptions = await stripe.subscriptions.list({
    customer: stripeCustomerId,
    status: "all",
    limit: 100,
  });
  for (const subscription of subscriptions.data) {
    if (!BLOCKING_CHECKOUT_STATUSES.has(subscription.status)) continue;
    const canceled = await stripe.subscriptions.cancel(subscription.id, {
      invoice_now: false,
      prorate: false,
    });
    await syncStripeSubscription(canceled);
  }
}

export function stripeSubscriptionIdFromInvoice(
  invoice: Stripe.Invoice
): string | null {
  const parent = invoice.parent;
  if (!parent || parent.type !== "subscription_details") return null;
  const subscription = parent.subscription_details?.subscription;
  if (!subscription) return null;
  return typeof subscription === "string" ? subscription : subscription.id;
}
