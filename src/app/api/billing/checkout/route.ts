import { NextResponse } from "next/server";
import {
  findBlockingSubscription,
  findOpenCheckoutSession,
  getOrCreateBillingCustomer,
  verifyConfiguredStripePrice,
} from "@/lib/billing/billing.server";
import {
  getRequestOrigin,
  getStripePriceId,
  isPaidSubscriptionReady,
  isStripeAutomaticTaxEnabled,
  LIBREAD_BILLING_TERMS_VERSION,
  LIBREAD_SUBSCRIPTION_PRICE_JPY,
} from "@/lib/billing/billingConfig";
import {
  billingMessage,
  localizeBillingPath,
  parseBillingUiLocale,
  subscriptionCheckoutSubmitMessage,
} from "@/lib/billing/billingLocale";
import { getStripeClient } from "@/lib/billing/stripe.server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let payload: { accepted?: boolean; locale?: unknown } = {};
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    // The explicit acceptance below still rejects an empty or malformed body.
  }
  const locale = parseBillingUiLocale(payload.locale);

  if (payload.accepted !== true) {
    return NextResponse.json(
      {
        ok: false,
        error: "terms_acceptance_required",
        message: billingMessage(locale, "termsAcceptanceRequired"),
      },
      { status: 400 }
    );
  }

  if (!isPaidSubscriptionReady()) {
    return NextResponse.json(
      {
        ok: false,
        error: "billing_not_ready",
        message: billingMessage(locale, "billingNotReady"),
      },
      { status: 503 }
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  const user = data.user;
  if (error || !user?.email) {
    return NextResponse.json(
      {
        ok: false,
        error: "authentication_required",
        message: billingMessage(locale, "authenticationRequired"),
      },
      { status: 401 }
    );
  }

  try {
    await verifyConfiguredStripePrice();
    const stripeCustomerId = await getOrCreateBillingCustomer({
      userId: user.id,
      email: user.email,
    });
    const existingSubscription = await findBlockingSubscription(stripeCustomerId);
    if (existingSubscription) {
      return NextResponse.json(
        {
          ok: false,
          error: "subscription_already_exists",
          message: billingMessage(locale, "subscriptionAlreadyExists"),
        },
        { status: 409 }
      );
    }

    const openSession = await findOpenCheckoutSession(stripeCustomerId);
    if (openSession?.url && openSession.locale === locale) {
      return NextResponse.json({ ok: true, url: openSession.url });
    }

    const origin = getRequestOrigin(request);
    const returnPath = localizeBillingPath("/subscription", locale);
    const stripe = getStripeClient();
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      integration_identifier: "libread_checkout_kmptzqrx",
      customer: stripeCustomerId,
      client_reference_id: user.id,
      line_items: [{ price: getStripePriceId(), quantity: 1 }],
      locale,
      allow_promotion_codes: false,
      billing_address_collection: "auto",
      customer_update: { address: "auto", name: "auto" },
      automatic_tax: { enabled: isStripeAutomaticTaxEnabled() },
      // The subscription page already records explicit acceptance before this
      // request. Requiring Checkout's separate consent box also requires a
      // Dashboard-hosted TOS URL and prevents session creation when it is unset.
      success_url: `${origin}${returnPath}?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}${returnPath}?checkout=canceled`,
      metadata: {
        libread_user_id: user.id,
        terms_version: LIBREAD_BILLING_TERMS_VERSION,
      },
      subscription_data: {
        metadata: {
          libread_user_id: user.id,
          terms_version: LIBREAD_BILLING_TERMS_VERSION,
        },
      },
      custom_text: {
        submit: {
          message: subscriptionCheckoutSubmitMessage(
            locale,
            LIBREAD_SUBSCRIPTION_PRICE_JPY
          ),
        },
      },
    });

    if (!session.url) throw new Error("Stripe Checkout URL is unavailable");
    return NextResponse.json({ ok: true, url: session.url });
  } catch (checkoutError) {
    console.error("[billing-checkout]", checkoutError);
    const checkoutMessage =
      checkoutError instanceof Error ? checkoutError.message : "";
    const liveChargesUnavailable = checkoutMessage.includes(
      "cannot currently make live charges"
    );
    return NextResponse.json(
      {
        ok: false,
        error: liveChargesUnavailable
          ? "live_charges_unavailable"
          : "checkout_failed",
        message: billingMessage(
          locale,
          liveChargesUnavailable ? "liveChargesUnavailable" : "checkoutFailed"
        ),
      },
      { status: liveChargesUnavailable ? 503 : 500 }
    );
  }
}
