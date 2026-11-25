import assert from "node:assert/strict";
import Module from "node:module";

// Characterization test: pins current behavior only (LT-002).
// Env values are fake placeholders set only inside this process; no Stripe or Supabase access.

const moduleWithLoad = Module as unknown as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown;
};
const originalLoad = moduleWithLoad._load;
moduleWithLoad._load = function (request, parent, isMain) {
  if (request === "server-only") return {};
  return originalLoad.call(this, request, parent, isMain);
};

const NAMES = [
  "LIBREAD_CREDIT_PACK_CATALOG_JSON",
  "LIBREAD_CREDIT_PURCHASE_ENABLED",
  "LIBREAD_CREDIT_TERMS_VERSION",
  "PUBLIC_TRANSLATION_CREDITS_ENABLED",
  "LIBREAD_LEGAL_SELLER_NAME",
  "LIBREAD_LEGAL_RESPONSIBLE_PERSON",
  "LIBREAD_LEGAL_ADDRESS",
  "LIBREAD_LEGAL_PHONE",
  "STRIPE_RESTRICTED_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_PRICE_ID",
] as const;
const env = process.env as Record<string, string | undefined>;
const saved = Object.fromEntries(NAMES.map((name) => [name, env[name]]));

function resetEnv(values: Partial<Record<(typeof NAMES)[number], string>> = {}) {
  for (const name of NAMES) delete env[name];
  Object.assign(env, values);
}

const pack = (overrides: Record<string, unknown> = {}) => ({
  id: "pack_a",
  credits: 3,
  stripePriceId: "price_fake_a",
  displayPriceJpy: 200,
  currency: "jpy",
  expiresInDays: 30,
  ...overrides,
});

async function main() {
  const catalog = await import("../src/lib/billing/creditPackCatalog");
  try {
    resetEnv();
    const builtIn = catalog.getCreditPackCatalog();
    assert.deepEqual(
      builtIn.map((item) => [item.id, item.credits, item.displayPriceJpy, item.currency, item.expiresInDays]),
      [
        ["credits_5", 5, 300, "JPY", 150],
        ["credits_8", 8, 450, "JPY", 150],
        ["credits_12", 12, 600, "JPY", 150],
      ]
    );
    assert.ok(builtIn.every((item) => item.stripePriceId.startsWith("price_")));
    assert.notEqual(catalog.getCreditPackCatalog()[0], builtIn[0], "returns copies");
    assert.equal(catalog.getCreditPack("credits_8")?.credits, 8);
    assert.equal(catalog.getCreditPack("missing"), null);
    assert.equal(catalog.getCreditPackByStripePriceId(builtIn[2]!.stripePriceId)?.id, "credits_12");
    assert.equal(catalog.getCreditPackByStripePriceId("price_unknown"), null);

    // Custom catalog via env.
    resetEnv({ LIBREAD_CREDIT_PACK_CATALOG_JSON: JSON.stringify([pack({ id: " pack_a ", stripePriceId: " price_fake_a " })]) });
    assert.deepEqual(catalog.getCreditPackCatalog(), [
      { id: "pack_a", stripePriceId: "price_fake_a", credits: 3, displayPriceJpy: 200, expiresInDays: 30, currency: "JPY" },
    ]);

    const invalid: Array<[string, RegExp]> = [
      ["{bad", /invalid JSON/],
      [JSON.stringify({}), /must be an array/],
      [JSON.stringify([pack({ stripePriceId: "prod_x" })]), /contains an invalid pack/],
      [JSON.stringify([pack({ credits: 1.5 })]), /contains an invalid pack/],
      [JSON.stringify([pack({ currency: "USD" })]), /contains an invalid pack/],
      [JSON.stringify([pack({ id: "bad id" })]), /contains an invalid pack/],
      [JSON.stringify([pack(), pack({ stripePriceId: "price_other" })]), /must be unique/],
      [JSON.stringify([pack(), pack({ id: "pack_b" })]), /must be unique/],
    ];
    for (const [raw, pattern] of invalid) {
      resetEnv({ LIBREAD_CREDIT_PACK_CATALOG_JSON: raw });
      assert.throws(() => catalog.getCreditPackCatalog(), pattern, raw);
    }

    // Terms version default and override.
    resetEnv();
    assert.equal(catalog.getCreditTermsVersion(), catalog.LIBREAD_DEFAULT_CREDIT_TERMS_VERSION);
    assert.equal(catalog.LIBREAD_DEFAULT_CREDIT_TERMS_VERSION, "2026-09-14-credit-v1");
    resetEnv({ LIBREAD_CREDIT_TERMS_VERSION: " v2 " });
    assert.equal(catalog.getCreditTermsVersion(), "v2");

    // Purchase is enabled only when every gate is on.
    const ready = {
      PUBLIC_TRANSLATION_CREDITS_ENABLED: "true",
      LIBREAD_CREDIT_PURCHASE_ENABLED: "yes",
      LIBREAD_LEGAL_SELLER_NAME: "fixture seller",
      LIBREAD_LEGAL_RESPONSIBLE_PERSON: "fixture person",
      LIBREAD_LEGAL_ADDRESS: "fixture address",
      LIBREAD_LEGAL_PHONE: "000",
      STRIPE_SECRET_KEY: "fake-secret",
      STRIPE_WEBHOOK_SECRET: "fake-webhook",
      STRIPE_PRICE_ID: "fake-price",
    };
    resetEnv(ready);
    assert.equal(catalog.isCreditPurchaseEnabled(), true);
    resetEnv({ ...ready, LIBREAD_CREDIT_PURCHASE_ENABLED: "maybe" });
    assert.equal(catalog.isCreditPurchaseEnabled(), false, "unknown values fall back to off");
    resetEnv({ ...ready, PUBLIC_TRANSLATION_CREDITS_ENABLED: "off" });
    assert.equal(catalog.isCreditPurchaseEnabled(), false);
    resetEnv({ ...ready, STRIPE_WEBHOOK_SECRET: "" });
    assert.equal(catalog.isCreditPurchaseEnabled(), false);
    resetEnv({ ...ready, LIBREAD_LEGAL_ADDRESS: "" });
    assert.equal(catalog.isCreditPurchaseEnabled(), false);
  } finally {
    resetEnv(Object.fromEntries(Object.entries(saved).filter(([, value]) => value !== undefined)) as Record<string, string>);
    moduleWithLoad._load = originalLoad;
  }

  console.log("PASS: credit pack catalog (built-in packs, env catalog validation, terms version, purchase gates)");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
