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
} from "@/lib/billing/billingConfig";
import { getStripeClient } from "@/lib/billing/stripe.server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let payload: { accepted?: boolean } = {};
  try {
    payload = (await request.json()) as { accepted?: boolean };
  } catch {
    // The explicit acceptance below still rejects an empty or malformed body.
  }

  if (payload.accepted !== true) {
    return NextResponse.json(
      {
        ok: false,
        error: "terms_acceptance_required",
        message: "料金・自動更新・解約条件を確認してから進んでください。",
      },
      { status: 400 }
    );
  }

  if (!isPaidSubscriptionReady()) {
    return NextResponse.json(
      {
        ok: false,
        error: "billing_not_ready",
        message:
          "決済設定または特定商取引法に基づく表記が未完了のため、現在は契約できません。",
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
        message: "サブスクの契約にはログインが必要です。",
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
          message:
            "処理中または利用中の契約があります。契約管理から状態を確認してください。",
        },
        { status: 409 }
      );
    }

    const openSession = await findOpenCheckoutSession(stripeCustomerId);
    if (openSession?.url) {
      return NextResponse.json({ ok: true, url: openSession.url });
    }

    const origin = getRequestOrigin(request);
    const stripe = getStripeClient();
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      integration_identifier: "libread_checkout_kmptzqrx",
      customer: stripeCustomerId,
      client_reference_id: user.id,
      line_items: [{ price: getStripePriceId(), quantity: 1 }],
      locale: "ja",
      allow_promotion_codes: false,
      billing_address_collection: "auto",
      customer_update: { address: "auto", name: "auto" },
      automatic_tax: { enabled: isStripeAutomaticTaxEnabled() },
      consent_collection: { terms_of_service: "required" },
      success_url: `${origin}/subscription?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/subscription?checkout=canceled`,
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
          message:
            "月額680円（税込）の自動更新です。解約後も当月の利用期限まで使えます。",
        },
      },
    });

    if (!session.url) throw new Error("Stripe Checkout URLを取得できませんでした。");
    return NextResponse.json({ ok: true, url: session.url });
  } catch (checkoutError) {
    console.error("[billing-checkout]", checkoutError);
    return NextResponse.json(
      {
        ok: false,
        error: "checkout_failed",
        message: "決済画面を開けませんでした。時間を置いて再度お試しください。",
      },
      { status: 500 }
    );
  }
}
