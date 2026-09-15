import { NextResponse } from "next/server";
import { getBillingCustomerId } from "@/lib/billing/billing.server";
import { getRequestOrigin, isStripeConfigured } from "@/lib/billing/billingConfig";
import {
  billingMessage,
  localizeBillingPath,
  parseBillingUiLocale,
} from "@/lib/billing/billingLocale";
import { getStripeClient } from "@/lib/billing/stripe.server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let payload: { locale?: unknown } = {};
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    // Older clients may send no body; keep the Japanese default in that case.
  }
  const locale = parseBillingUiLocale(payload.locale);

  if (!isStripeConfigured()) {
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
  if (error || !data.user) {
    return NextResponse.json(
      { ok: false, error: "authentication_required" },
      { status: 401 }
    );
  }

  try {
    const stripeCustomerId = await getBillingCustomerId(data.user.id);
    if (!stripeCustomerId) {
      return NextResponse.json(
        {
          ok: false,
          error: "billing_customer_not_found",
          message: billingMessage(locale, "billingCustomerNotFound"),
        },
        { status: 404 }
      );
    }

    const session = await getStripeClient().billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: `${getRequestOrigin(request)}${localizeBillingPath("/subscription", locale)}`,
      locale,
    });
    return NextResponse.json({ ok: true, url: session.url });
  } catch (portalError) {
    console.error("[billing-portal]", portalError);
    return NextResponse.json(
      {
        ok: false,
        error: "portal_failed",
        message: billingMessage(locale, "portalFailed"),
      },
      { status: 500 }
    );
  }
}
