import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

function main() {
  const catalog = source("src/lib/billing/creditPackCatalog.ts");
  assert.ok(catalog.includes("LIBREAD_CREDIT_PACK_CATALOG_JSON"));
  assert.ok(catalog.includes("LIBREAD_CREDIT_PURCHASE_ENABLED"));
  assert.ok(catalog.includes("LIBREAD_DEFAULT_CREDIT_TERMS_VERSION"));
  assert.ok(catalog.includes('id: "credits_5"'));
  assert.ok(catalog.includes('id: "credits_8"'));
  assert.ok(catalog.includes('id: "credits_12"'));
  assert.ok(catalog.includes('price_1UFLrkLuEpSwUk8MmDN2oYv1'));
  assert.ok(catalog.includes('price_1UFLroLuEpSwUk8M3T4fla86'));
  assert.ok(catalog.includes('price_1UFLryLuEpSwUk8MMmg0Ubt1'));
  assert.ok(catalog.includes("displayPriceJpy: 300"));
  assert.ok(catalog.includes("displayPriceJpy: 450"));
  assert.ok(catalog.includes("displayPriceJpy: 600"));
  assert.ok(catalog.includes("expiresInDays: 150"));
  assert.ok(catalog.includes("hasCompleteLegalSellerDetails"));
  assert.ok(catalog.includes("isStripeConfigured"));

  const checkout = source("src/app/api/billing/credits/checkout/route.ts");
  assert.ok(checkout.includes('mode: "payment"'));
  assert.ok(checkout.includes("getCreditPack(packId)"));
  assert.ok(checkout.includes("accepted !== true"));
  assert.ok(checkout.includes("line_items: [{ price: pack.stripePriceId, quantity: 1 }]"));
  assert.ok(checkout.includes("/credits?credit_checkout=success"));
  assert.ok(checkout.includes("/credits?credit_checkout=canceled"));

  const balanceCard = source("src/app/mypage/CreditBalanceCard.tsx");
  assert.ok(balanceCard.includes('localizePath("/credits"'));
  assert.ok(balanceCard.includes('store: "クレジットを購入"'));
  assert.equal(balanceCard.includes("クレジット販売は現在準備中"), false);

  const unlockGate = source("src/features/playback/PublicTranslationUnlockGate.tsx");
  assert.ok(unlockGate.includes('localizePath("/credits"'));

  const commercial = source("src/app/commercial-transactions/page.tsx");
  assert.ok(commercial.includes("クレジット有効期限"));
  assert.ok(commercial.includes("返金・キャンセル"));

  const webhook = source("src/app/api/billing/webhook/route.ts");
  assert.ok(webhook.includes("constructEventAsync"));
  assert.ok(webhook.includes('checkout.session.async_payment_succeeded'));
  assert.ok(webhook.includes('charge.refunded'));
  assert.ok(webhook.includes('charge.dispute.created'));
  assert.ok(webhook.includes("reverse_credit_purchase_full"));

  console.log("PASS: Stripe credit checkout/webhook fixture");
}

main();
