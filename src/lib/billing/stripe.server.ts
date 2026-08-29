import "server-only";

import Stripe from "stripe";
import { getStripeSecretKey } from "@/lib/billing/billingConfig";

let stripeClient: Stripe | null = null;

export function getStripeClient(): Stripe {
  if (!stripeClient) {
    stripeClient = new Stripe(getStripeSecretKey(), {
      appInfo: {
        name: "LIB read",
        version: "1.0.0",
      },
    });
  }

  return stripeClient;
}
