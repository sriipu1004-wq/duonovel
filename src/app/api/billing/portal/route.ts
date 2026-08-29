import { NextResponse } from "next/server";
import { getBillingCustomerId } from "@/lib/billing/billing.server";
import { getRequestOrigin, isStripeConfigured } from "@/lib/billing/billingConfig";
import { getStripeClient } from "@/lib/billing/stripe.server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isStripeConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        error: "billing_not_ready",
        message: "契約管理は現在準備中です。",
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
          message: "管理対象の契約がありません。",
        },
        { status: 404 }
      );
    }

    const session = await getStripeClient().billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: `${getRequestOrigin(request)}/subscription`,
      locale: "ja",
    });
    return NextResponse.json({ ok: true, url: session.url });
  } catch (portalError) {
    console.error("[billing-portal]", portalError);
    return NextResponse.json(
      {
        ok: false,
        error: "portal_failed",
        message: "契約管理画面を開けませんでした。",
      },
      { status: 500 }
    );
  }
}
