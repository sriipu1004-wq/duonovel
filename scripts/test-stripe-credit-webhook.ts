import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

function main() {
  const catalog = source("src/lib/billing/creditPackCatalog.ts");
  assert.ok(catalog.includes("LIBREAD_CREDIT_PACK_CATALOG_JSON"));
  assert.ok(catalog.includes("LIBREAD_CREDIT_PURCHASE_ENABLED"));
  assert.ok(catalog.includes("LIBREAD_CREDIT_TERMS_VERSION"));
  assert.ok(catalog.includes('currency: "JPY"'));
  assert.ok(catalog.includes("expiresInDays"));
  assert.ok(catalog.includes("hasCompleteLegalSellerDetails"));
  assert.ok(catalog.includes("isStripeConfigured"));
  assert.equal(
    /displayPriceJpy:\s*\d/.test(catalog),
    false,
    "Live credit pricing must not be hardcoded in the catalog module"
  );

  const checkout = source("src/app/api/billing/credits/checkout/route.ts");
  assert.ok(checkout.includes('mode: "payment"'));
  assert.ok(checkout.includes("getCreditPack(packId)"));
  assert.ok(checkout.includes("accepted !== true"));
  assert.ok(checkout.includes("line_items: [{ price: pack.stripePriceId, quantity: 1 }]"));
  assert.ok(checkout.includes("/credits?credit_checkout=success"));
  assert.ok(checkout.includes("/credits?credit_checkout=canceled"));
  assert.equal(
    /credits\s*=\s*(payload|body)/.test(checkout),
    false,
    "checkout must never trust a client-supplied credit quantity"
  );

  const balanceCard = source("src/app/mypage/CreditBalanceCard.tsx");
  assert.ok(balanceCard.includes('type="checkbox"'));
  assert.ok(balanceCard.includes('/commercial-transactions'));
  assert.ok(balanceCard.includes('accepted: true'));
  assert.ok(balanceCard.includes('localizePath("/credits"'));

  const creditStore = source("src/app/credits/page.tsx");
  assert.ok(creditStore.includes('requireLoggedInUser("/credits")'));
  assert.ok(creditStore.includes("getAuthenticatedCreditBalance"));
  assert.ok(creditStore.includes("getCreditPackCatalog"));
  assert.ok(creditStore.includes("isCreditPurchaseEnabled"));
  assert.ok(creditStore.includes("showStoreLink={false}"));

  const unlockGate = source("src/features/playback/PublicTranslationUnlockGate.tsx");
  assert.ok(unlockGate.includes('localizePath("/credits"'));

  const commercial = source("src/app/commercial-transactions/page.tsx");
  assert.ok(commercial.includes("getCreditPackCatalog"));
  assert.ok(commercial.includes("クレジット有効期限"));
  assert.ok(commercial.includes("返金・キャンセル"));
  assert.ok(commercial.includes("クレジット利用条件"));

  const webhook = source("src/app/api/billing/webhook/route.ts");
  assert.ok(webhook.includes("constructEventAsync"), "Stripe signature verification must remain");
  assert.ok(webhook.includes("libread_stripe_webhook_events"));
  assert.ok(webhook.includes("existing.data?.processed_at"));
  assert.ok(webhook.includes('session.payment_status !== "paid"'));
  assert.ok(webhook.includes("getCreditPackByStripePriceId"));
  assert.ok(webhook.includes("stripe_checkout:${hydrated.id}"));
  assert.ok(webhook.includes('checkout.session.async_payment_succeeded'));
  assert.ok(webhook.includes('charge.refunded'));
  assert.ok(webhook.includes('charge.dispute.created'));
  assert.ok(webhook.includes("reverse_credit_purchase_full"));
  assert.ok(
    webhook.includes("if (!charge.refunded) return"),
    "partial refunds must not guess a discrete credit reversal amount"
  );

  const runtimeMigration = source(
    "supabase/migrations/20260914070000_add_public_translation_credit_runtime.sql"
  );
  assert.ok(runtimeMigration.includes("unique (user_id, idempotency_key)") || source(
    "supabase/migrations/20260912100000_add_public_translation_unlocks_credit_ledger.sql"
  ).includes("unique (user_id, idempotency_key)"));
  assert.ok(runtimeMigration.includes("stripe_checkout_session_id text not null unique"));
  assert.ok(runtimeMigration.includes("stripe_event_key text not null unique"));
  assert.ok(runtimeMigration.includes("grant_credit_purchase"));
  assert.ok(runtimeMigration.includes("reverse_credit_purchase_full"));

  const expiryMigration = source(
    "supabase/migrations/20260914071000_enforce_credit_purchase_expiration.sql"
  );
  assert.ok(expiryMigration.includes("remaining_credits"));
  assert.ok(expiryMigration.includes("expired_credits"));
  assert.ok(expiryMigration.includes("credit_expiry:"));
  assert.ok(expiryMigration.includes("order by lot.expires_at asc, lot.created_at asc"));

  const debtReconciliation = source(
    "supabase/migrations/20260914073000_reconcile_credit_purchase_debt.sql"
  );
  assert.ok(debtReconciliation.includes("credits_applied_to_negative_balance"));
  assert.ok(debtReconciliation.includes("v_remaining := p_credits - v_debt_offset"));
  assert.ok(
    debtReconciliation.indexOf("refresh_credit_expirations") <
      debtReconciliation.indexOf("v_remaining :="),
    "purchase lots must reconcile the current balance before setting expirable remaining credits"
  );

  console.log("PASS: Stripe credit checkout/webhook fixture");
}

main();
