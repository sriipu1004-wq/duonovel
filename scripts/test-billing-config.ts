import assert from "node:assert/strict";
import Module from "node:module";

// Characterization test: pins current behavior only (LT-002).
// Env values are fake placeholders set only inside this process; no Stripe access.

// `server-only` throws outside a React Server Components bundle; stub only that marker module.
const moduleWithLoad = Module as unknown as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown;
};
const originalLoad = moduleWithLoad._load;
moduleWithLoad._load = function (request, parent, isMain) {
  if (request === "server-only") return {};
  return originalLoad.call(this, request, parent, isMain);
};

const NAMES = [
  "LIBREAD_LEGAL_SELLER_NAME",
  "LIBREAD_LEGAL_RESPONSIBLE_PERSON",
  "LIBREAD_LEGAL_ADDRESS",
  "LIBREAD_LEGAL_PHONE",
  "LIBREAD_LEGAL_SUPPORT_EMAIL",
  "STRIPE_RESTRICTED_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_PRICE_ID",
  "STRIPE_AUTOMATIC_TAX_ENABLED",
  "LIBREAD_BILLING_CHECKOUT_ENABLED",
  "NEXT_PUBLIC_SITE_URL",
  "VERCEL_ENV",
] as const;

const env = process.env as Record<string, string | undefined>;
const saved = Object.fromEntries(NAMES.map((name) => [name, env[name]]));
const savedNodeEnv = env.NODE_ENV;

function resetEnv(values: Partial<Record<(typeof NAMES)[number], string>> = {}) {
  for (const name of NAMES) delete env[name];
  Object.assign(env, values);
}

async function main() {
  const config = await import("../src/lib/billing/billingConfig");
  try {
    assert.equal(config.LIBREAD_SUBSCRIPTION_PRICE_JPY, 680);
    assert.equal(config.LIBREAD_SUBSCRIBER_MONTHLY_AI_BUDGET_JPY, 300);
    assert.equal(config.LIBREAD_BILLING_TERMS_VERSION, "2026-08-29-680");

    resetEnv();
    const defaults = config.getLegalSellerDetails();
    assert.equal(defaults.sellerName, "");
    assert.ok(defaults.supportEmail.length > 0, "support e-mail has a built-in default");
    assert.equal(config.hasCompleteLegalSellerDetails(), false);
    assert.equal(config.isStripeConfigured(), false);
    assert.equal(config.isStripeAutomaticTaxEnabled(), false);
    assert.equal(config.isBillingCheckoutEnabled(), true, "checkout is on unless explicitly disabled");
    assert.equal(config.isPaidSubscriptionReady(), false);
    assert.throws(() => config.getStripePriceId(), /STRIPE_PRICE_ID is missing/);
    assert.throws(() => config.getStripeWebhookSecret(), /STRIPE_WEBHOOK_SECRET is missing/);
    assert.throws(() => config.getStripeSecretKey(), /STRIPE_RESTRICTED_KEY or STRIPE_SECRET_KEY is missing/);

    for (const value of ["false", "0", "OFF", " off "]) {
      resetEnv({ LIBREAD_BILLING_CHECKOUT_ENABLED: value });
      assert.equal(config.isBillingCheckoutEnabled(), false, value);
    }
    for (const value of ["true", "1", "On"]) {
      resetEnv({ STRIPE_AUTOMATIC_TAX_ENABLED: value });
      assert.equal(config.isStripeAutomaticTaxEnabled(), true, value);
    }

    const complete = {
      LIBREAD_LEGAL_SELLER_NAME: "fixture seller",
      LIBREAD_LEGAL_RESPONSIBLE_PERSON: "fixture person",
      LIBREAD_LEGAL_ADDRESS: "fixture address",
      LIBREAD_LEGAL_PHONE: "000",
      STRIPE_SECRET_KEY: "fake-secret",
      STRIPE_WEBHOOK_SECRET: "fake-webhook",
      STRIPE_PRICE_ID: " fake-price ",
    };
    resetEnv(complete);
    assert.equal(config.hasCompleteLegalSellerDetails(), true);
    assert.equal(config.isStripeConfigured(), true);
    assert.equal(config.isPaidSubscriptionReady(), true);
    assert.equal(config.getStripePriceId(), "fake-price");
    assert.equal(config.getStripeSecretKey(), "fake-secret");
    // Restricted key takes precedence over the secret key.
    resetEnv({ ...complete, STRIPE_RESTRICTED_KEY: "fake-restricted" });
    assert.equal(config.getStripeSecretKey(), "fake-restricted");
    // Any missing piece makes paid subscriptions not ready.
    resetEnv({ ...complete, LIBREAD_LEGAL_PHONE: " " });
    assert.equal(config.isPaidSubscriptionReady(), false);
    resetEnv({ ...complete, LIBREAD_BILLING_CHECKOUT_ENABLED: "off" });
    assert.equal(config.isPaidSubscriptionReady(), false);

    // Request origin: configured site URL only on production deployments.
    const request = new Request("https://preview.invalid/api/billing/checkout");
    resetEnv({ NEXT_PUBLIC_SITE_URL: "https://site.invalid/path", VERCEL_ENV: "preview" });
    assert.equal(config.getRequestOrigin(request), "https://preview.invalid");
    resetEnv({ NEXT_PUBLIC_SITE_URL: "https://site.invalid/path", VERCEL_ENV: "production" });
    assert.equal(config.getRequestOrigin(request), "https://site.invalid");
    resetEnv({ NEXT_PUBLIC_SITE_URL: "not a url", VERCEL_ENV: "production" });
    assert.throws(() => config.getRequestOrigin(request), /NEXT_PUBLIC_SITE_URL is invalid/);
    resetEnv({ VERCEL_ENV: "production" });
    assert.equal(config.getRequestOrigin(request), "https://preview.invalid");
    // Without VERCEL_ENV, NODE_ENV decides.
    resetEnv({ NEXT_PUBLIC_SITE_URL: "https://site.invalid" });
    env.NODE_ENV = "production";
    assert.equal(config.getRequestOrigin(request), "https://site.invalid");
    env.NODE_ENV = "test";
    assert.equal(config.getRequestOrigin(request), "https://preview.invalid");
  } finally {
    resetEnv(Object.fromEntries(Object.entries(saved).filter(([, value]) => value !== undefined)) as Record<string, string>);
    if (savedNodeEnv === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = savedNodeEnv;
    moduleWithLoad._load = originalLoad;
  }

  console.log("PASS: billing config (constants, env flags, readiness, Stripe getters, request origin)");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
