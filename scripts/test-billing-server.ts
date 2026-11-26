import assert from "node:assert/strict";
import Module from "node:module";

// Characterization test: pins current behavior only (LT-002).
// The admin Supabase client and the Stripe client are fakes replaced in-process.
// No DB, Stripe or network access; env values are fake placeholders.

type DbResult = { data: unknown; error: { message: string } | null };
const db = {
  reads: new Map<string, DbResult>(), // key: table
  upserts: [] as Array<{ table: string; row: Record<string, unknown>; options: unknown }>,
  upsertErrors: new Map<string, { message: string }>(),
  readCalls: [] as unknown[][],
};
const adminStub = {
  createAdminClient: () => ({
    from(table: string) {
      const calls: unknown[] = [table];
      const builder = {
        select: (columns: string) => (calls.push(["select", columns]), builder),
        eq: (column: string, value: unknown) => (calls.push(["eq", column, value]), builder),
        maybeSingle: async () => {
          db.readCalls.push(calls);
          return db.reads.get(table) ?? { data: null, error: null };
        },
        upsert: async (row: Record<string, unknown>, options: unknown) => {
          db.upserts.push({ table, row, options });
          return { error: db.upsertErrors.get(table) ?? null };
        },
      };
      return builder;
    },
  }),
};

const stripe = {
  calls: [] as unknown[][],
  subscriptions: [] as Array<Record<string, unknown>>,
  sessions: [] as Array<Record<string, unknown>>,
  price: {} as Record<string, unknown>,
};
const stripeClient = {
  customers: {
    update: async (...args: unknown[]) => (stripe.calls.push(["customers.update", ...args]), {}),
    create: async (...args: unknown[]) => (stripe.calls.push(["customers.create", ...args]), { id: "cus_new" }),
  },
  subscriptions: {
    list: async (...args: unknown[]) => (stripe.calls.push(["subscriptions.list", ...args]), { data: stripe.subscriptions }),
    cancel: async (id: string, options: unknown) => {
      stripe.calls.push(["subscriptions.cancel", id, options]);
      const found = stripe.subscriptions.find((item) => item.id === id)!;
      return { ...found, status: "canceled" };
    },
  },
  checkout: {
    sessions: { list: async (...args: unknown[]) => (stripe.calls.push(["sessions.list", ...args]), { data: stripe.sessions }) },
  },
  prices: { retrieve: async (...args: unknown[]) => (stripe.calls.push(["prices.retrieve", ...args]), stripe.price) },
};

const moduleWithLoad = Module as unknown as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown;
};
const originalLoad = moduleWithLoad._load;
moduleWithLoad._load = function (request, parent, isMain) {
  if (request === "server-only") return {};
  if (request === "@/lib/supabase/admin" || request.endsWith("/lib/supabase/admin")) return adminStub;
  if (request === "@/lib/billing/stripe.server" || request.endsWith("/lib/billing/stripe.server")) return { getStripeClient: () => stripeClient };
  return originalLoad.call(this, request, parent, isMain);
};

const env = process.env as Record<string, string | undefined>;
const saved = { price: env.STRIPE_PRICE_ID, tax: env.STRIPE_AUTOMATIC_TAX_ENABLED };

function subscription(overrides: Record<string, unknown> = {}) {
  return {
    id: "sub_1",
    customer: "cus_1",
    status: "active",
    cancel_at_period_end: false,
    metadata: {},
    items: { data: [{ price: { id: "price_fake" }, current_period_end: 1_800_000_000 }] },
    ...overrides,
  };
}

async function main() {
  try {
    env.STRIPE_PRICE_ID = "price_fake";
    delete env.STRIPE_AUTOMATIC_TAX_ENABLED;
    const billing = await import("../src/lib/billing/billing.server");
    type Sub = Parameters<typeof billing.syncStripeSubscription>[0];
    type Invoice = Parameters<typeof billing.stripeSubscriptionIdFromInvoice>[0];

    // Subscription summary.
    db.reads.set("libread_billing_subscriptions", {
      data: { status: "active", current_period_end: "2027-01-01T00:00:00.000Z", cancel_at_period_end: true, stripe_price_id: "price_fake" },
      error: null,
    });
    assert.deepEqual(await billing.getBillingSubscriptionSummary("user-1"), {
      status: "active",
      currentPeriodEnd: "2027-01-01T00:00:00.000Z",
      cancelAtPeriodEnd: true,
      isEntitled: true,
    });
    db.reads.set("libread_billing_subscriptions", { data: { status: "active", stripe_price_id: "price_other" }, error: null });
    assert.equal((await billing.getBillingSubscriptionSummary("user-1"))?.isEntitled, false, "other price");
    db.reads.set("libread_billing_subscriptions", { data: { status: "past_due", stripe_price_id: "price_fake" }, error: null });
    assert.equal((await billing.getBillingSubscriptionSummary("user-1"))?.isEntitled, false, "past_due");
    db.reads.set("libread_billing_subscriptions", { data: null, error: { message: "x" } });
    assert.equal(await billing.getBillingSubscriptionSummary("user-1"), null);

    // Customer mapping.
    db.reads.set("libread_billing_customers", { data: { stripe_customer_id: "cus_1" }, error: null });
    assert.equal(await billing.getBillingCustomerId("user-1"), "cus_1");
    assert.equal(await billing.getOrCreateBillingCustomer({ userId: "user-1", email: "a@example.invalid" }), "cus_1");
    assert.deepEqual(stripe.calls.at(-1), ["customers.update", "cus_1", { email: "a@example.invalid", metadata: { libread_user_id: "user-1" } }]);
    db.reads.set("libread_billing_customers", { data: null, error: null });
    assert.equal(await billing.getOrCreateBillingCustomer({ userId: "user-2", email: "b@example.invalid" }), "cus_new");
    assert.deepEqual(stripe.calls.at(-1), [
      "customers.create",
      { email: "b@example.invalid", metadata: { libread_user_id: "user-2" } },
      { idempotencyKey: "libread-customer-v1:user-2" },
    ]);
    assert.deepEqual(db.upserts.at(-1)?.table, "libread_billing_customers");
    assert.equal(db.upserts.at(-1)?.row.stripe_customer_id, "cus_new");
    db.reads.set("libread_billing_customers", { data: null, error: { message: "denied" } });
    await assert.rejects(billing.getBillingCustomerId("user-1"), /課金利用者の確認に失敗しました: denied/);

    // Blocking subscription / open checkout.
    stripe.subscriptions = [subscription({ id: "sub_old", status: "canceled" }), subscription({ id: "sub_pd", status: "past_due" })];
    assert.equal((await billing.findBlockingSubscription("cus_1"))?.id, "sub_pd");
    stripe.subscriptions = [subscription({ status: "canceled" }), subscription({ status: "incomplete_expired" })];
    assert.equal(await billing.findBlockingSubscription("cus_1"), null);
    stripe.sessions = [
      { id: "cs_pay", mode: "payment", status: "open", url: "https://checkout.invalid/1" },
      { id: "cs_nourl", mode: "subscription", status: "open", url: null },
      { id: "cs_ok", mode: "subscription", status: "open", url: "https://checkout.invalid/2" },
    ];
    assert.equal((await billing.findOpenCheckoutSession("cus_1"))?.id, "cs_ok");

    // Price verification (680 JPY, monthly, tax inclusive).
    const goodPrice = { active: true, currency: "jpy", unit_amount: 680, recurring: { interval: "month", interval_count: 1 }, tax_behavior: "inclusive", product: { deleted: false, tax_code: null } };
    stripe.price = goodPrice;
    await billing.verifyConfiguredStripePrice();
    for (const bad of [{ unit_amount: 600 }, { currency: "usd" }, { tax_behavior: "exclusive" }, { active: false }, { recurring: { interval: "year", interval_count: 1 } }]) {
      stripe.price = { ...goodPrice, ...bad };
      await assert.rejects(billing.verifyConfiguredStripePrice(), /税込680円/, JSON.stringify(bad));
    }
    env.STRIPE_AUTOMATIC_TAX_ENABLED = "true";
    stripe.price = goodPrice;
    await assert.rejects(billing.verifyConfiguredStripePrice(), /Tax code/);
    stripe.price = { ...goodPrice, product: { deleted: false, tax_code: "txcd_fake" } };
    await billing.verifyConfiguredStripePrice();
    delete env.STRIPE_AUTOMATIC_TAX_ENABLED;

    // Sync: entitlement only for the configured price, active/trialing, with a period end.
    db.reads.set("libread_billing_customers", { data: { user_id: "user-1" }, error: null });
    db.upserts = [];
    await billing.syncStripeSubscription(subscription() as unknown as Sub);
    const entitlement = db.upserts.find((item) => item.table === "libread_user_entitlements")!;
    assert.equal(entitlement.row.plan_type, "subscriber");
    assert.equal(entitlement.row.subscriber_until, new Date(1_800_000_000 * 1000).toISOString());
    const stored = db.upserts.find((item) => item.table === "libread_billing_subscriptions")!;
    assert.equal(stored.row.stripe_price_id, "price_fake");
    assert.equal(stored.row.status, "active");

    for (const [label, sub] of [
      ["other price", subscription({ items: { data: [{ price: { id: "price_other" }, current_period_end: 1_800_000_000 }] } })],
      ["canceled", subscription({ status: "canceled" })],
      ["no period end", subscription({ items: { data: [{ price: { id: "price_fake" }, current_period_end: 0 }] } })],
    ] as const) {
      db.upserts = [];
      await billing.syncStripeSubscription(sub as unknown as Sub);
      const row = db.upserts.find((item) => item.table === "libread_user_entitlements")!.row;
      assert.deepEqual([row.plan_type, row.subscriber_until], ["free", null], label);
    }
    db.upserts = [];
    await billing.syncStripeSubscription(subscription({ items: { data: [] } }) as unknown as Sub);
    assert.equal(db.upserts.find((item) => item.table === "libread_billing_subscriptions")!.row.stripe_price_id, "unknown");

    // Ownership checks.
    await assert.rejects(
      billing.syncStripeSubscription(subscription({ metadata: { libread_user_id: "someone-else" } }) as unknown as Sub),
      /Stripe契約metadataと顧客所有者が一致しません。/
    );
    db.reads.set("libread_billing_customers", { data: null, error: null });
    await assert.rejects(billing.syncStripeSubscription(subscription() as unknown as Sub), /対応するLIB read利用者が見つかりません/);
    db.reads.set("libread_billing_customers", { data: { user_id: "user-1" }, error: null });
    db.upsertErrors.set("libread_user_entitlements", { message: "denied" });
    await assert.rejects(billing.syncStripeSubscription(subscription() as unknown as Sub), /有料権限の更新に失敗しました: denied/);
    db.upsertErrors.clear();

    // Account deletion cancels every blocking subscription without proration and syncs it.
    db.reads.set("libread_billing_customers", { data: { stripe_customer_id: "cus_1", user_id: "user-1" }, error: null });
    stripe.subscriptions = [subscription({ id: "sub_a", status: "active" }), subscription({ id: "sub_b", status: "canceled" }), subscription({ id: "sub_c", status: "unpaid" })];
    stripe.calls = [];
    db.upserts = [];
    await billing.cancelSubscriptionsBeforeAccountDeletion("user-1");
    assert.deepEqual(
      stripe.calls.filter((call) => call[0] === "subscriptions.cancel"),
      [
        ["subscriptions.cancel", "sub_a", { invoice_now: false, prorate: false }],
        ["subscriptions.cancel", "sub_c", { invoice_now: false, prorate: false }],
      ]
    );
    assert.ok(db.upserts.filter((item) => item.table === "libread_user_entitlements").every((item) => item.row.plan_type === "free"));
    db.reads.set("libread_billing_customers", { data: null, error: null });
    stripe.calls = [];
    await billing.cancelSubscriptionsBeforeAccountDeletion("user-9");
    assert.equal(stripe.calls.length, 0);

    // Invoice -> subscription id.
    assert.equal(billing.stripeSubscriptionIdFromInvoice({ parent: { type: "subscription_details", subscription_details: { subscription: "sub_1" } } } as unknown as Invoice), "sub_1");
    assert.equal(billing.stripeSubscriptionIdFromInvoice({ parent: { type: "subscription_details", subscription_details: { subscription: { id: "sub_2" } } } } as unknown as Invoice), "sub_2");
    assert.equal(billing.stripeSubscriptionIdFromInvoice({ parent: { type: "quote_details" } } as unknown as Invoice), null);
    assert.equal(billing.stripeSubscriptionIdFromInvoice({ parent: null } as unknown as Invoice), null);
  } finally {
    if (saved.price === undefined) delete env.STRIPE_PRICE_ID;
    else env.STRIPE_PRICE_ID = saved.price;
    if (saved.tax === undefined) delete env.STRIPE_AUTOMATIC_TAX_ENABLED;
    else env.STRIPE_AUTOMATIC_TAX_ENABLED = saved.tax;
    moduleWithLoad._load = originalLoad;
  }

  console.log("PASS: billing server (summary, customer mapping, blocking/open checks, price verification, sync, deletion cancel, invoice)");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
