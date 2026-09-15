import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  billingMessage,
  creditCheckoutSubmitMessage,
  localizeBillingPath,
  parseBillingUiLocale,
  subscriptionCheckoutSubmitMessage,
} from "../src/lib/billing/billingLocale";

assert.equal(parseBillingUiLocale("ja"), "ja");
assert.equal(parseBillingUiLocale("en"), "en");
assert.equal(parseBillingUiLocale("ko"), "ko");
assert.equal(parseBillingUiLocale("fr"), "ja");
assert.equal(parseBillingUiLocale(undefined), "ja");

assert.equal(localizeBillingPath("/subscription", "ja"), "/subscription");
assert.equal(localizeBillingPath("/subscription", "en"), "/en/subscription");
assert.equal(localizeBillingPath("/subscription", "ko"), "/ko/subscription");
assert.equal(localizeBillingPath("/credits", "en"), "/en/credits");
assert.equal(localizeBillingPath("/credits", "ko"), "/ko/credits");

assert.match(subscriptionCheckoutSubmitMessage("en", 680), /automatically renewing/i);
assert.match(subscriptionCheckoutSubmitMessage("ko", 680), /자동 갱신/u);
assert.match(creditCheckoutSubmitMessage({ locale: "en", credits: 5, expiresInDays: 150 }), /150 days/i);
assert.match(creditCheckoutSubmitMessage({ locale: "ko", credits: 5, expiresInDays: 150 }), /150일/u);
assert.notEqual(billingMessage("en", "checkoutFailed"), billingMessage("ja", "checkoutFailed"));
assert.notEqual(billingMessage("ko", "portalFailed"), billingMessage("ja", "portalFailed"));

function source(path: string): string {
  return readFileSync(path, "utf8");
}

const subscriptionClient = source("src/features/billing/SubscriptionActionButton.tsx");
const creditClient = source("src/app/mypage/CreditBalanceCard.tsx");
const subscriptionCheckout = source("src/app/api/billing/checkout/route.ts");
const portal = source("src/app/api/billing/portal/route.ts");
const creditCheckout = source("src/app/api/billing/credits/checkout/route.ts");

assert.equal(subscriptionClient.includes("JSON.stringify({ accepted, locale })"), true);
assert.equal(creditClient.includes("JSON.stringify({ packId, accepted: true, locale })"), true);
for (const routeSource of [subscriptionCheckout, portal, creditCheckout]) {
  assert.equal(routeSource.includes("parseBillingUiLocale"), true);
  assert.equal(routeSource.includes('locale: "ja"'), false);
}
assert.equal(subscriptionCheckout.includes('localizeBillingPath("/subscription", locale)'), true);
assert.equal(portal.includes('localizeBillingPath("/subscription", locale)'), true);
assert.equal(creditCheckout.includes('localizeBillingPath("/credits", locale)'), true);

console.log("PASS: Stripe checkout/portal locale and return routes preserve JA/EN/KO context");
