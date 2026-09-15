import { NextResponse } from "next/server";
import { getOrCreateBillingCustomer } from "@/lib/billing/billing.server";
import {
  getRequestOrigin,
  isStripeAutomaticTaxEnabled,
} from "@/lib/billing/billingConfig";
import {
  getCreditPack,
  getCreditTermsVersion,
  isCreditPurchaseEnabled,
} from "@/lib/billing/creditPackCatalog";
import {
  creditCheckoutSubmitMessage,
  localizeBillingPath,
  parseBillingUiLocale,
} from "@/lib/billing/billingLocale";
import { getStripeClient } from "@/lib/billing/stripe.server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let payload: { packId?: unknown; accepted?: unknown; locale?: unknown } = {};
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_request" }, { status: 400 });
  }
  const locale = parseBillingUiLocale(payload.locale);

  if (!isCreditPurchaseEnabled()) {
    return NextResponse.json(
      { ok: false, error: "credit_purchase_not_ready" },
      { status: 503 }
    );
  }
  if (payload.accepted !== true) {
    return NextResponse.json(
      { ok: false, error: "terms_acceptance_required" },
      { status: 400 }
    );
  }

  const packId = typeof payload.packId === "string" ? payload.packId.trim() : "";
  const pack = getCreditPack(packId);
  if (!pack) {
    return NextResponse.json({ ok: false, error: "unknown_credit_pack" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  const user = data.user;
  if (error || !user?.email) {
    return NextResponse.json(
      { ok: false, error: "authentication_required" },
      { status: 401 }
    );
  }

  try {
    const stripeCustomerId = await getOrCreateBillingCustomer({
      userId: user.id,
      email: user.email,
    });
    const origin = getRequestOrigin(request);
    const returnPath = localizeBillingPath("/credits", locale);
    const stripe = getStripeClient();
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer: stripeCustomerId,
      client_reference_id: user.id,
      line_items: [{ price: pack.stripePriceId, quantity: 1 }],
      locale,
      allow_promotion_codes: false,
      billing_address_collection: "auto",
      customer_update: { address: "auto", name: "auto" },
      automatic_tax: { enabled: isStripeAutomaticTaxEnabled() },
      success_url: `${origin}${returnPath}?credit_checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}${returnPath}?credit_checkout=canceled`,
      metadata: {
        libread_kind: "credit_pack",
        libread_user_id: user.id,
        pack_id: pack.id,
        terms_version: getCreditTermsVersion(),
      },
      custom_text: {
        submit: {
          message: creditCheckoutSubmitMessage({
            locale,
            credits: pack.credits,
            expiresInDays: pack.expiresInDays,
          }),
        },
      },
    });

    if (!session.url) throw new Error("Stripe Checkout URL is unavailable");
    return NextResponse.json({ ok: true, url: session.url });
  } catch (checkoutError) {
    console.error("[credit-checkout]", checkoutError);
    return NextResponse.json(
      { ok: false, error: "credit_checkout_failed" },
      { status: 500 }
    );
  }
}
