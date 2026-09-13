# Public translation credit runtime rollout

This branch keeps production behavior unchanged unless `PUBLIC_TRANSLATION_CREDITS_ENABLED=true`.

## Required database migrations

Apply, in order:

1. `20260914070000_add_public_translation_credit_runtime.sql`
2. `20260914071000_enforce_credit_purchase_expiration.sql`
3. `20260914072000_fix_credit_unlock_append_only.sql`
4. `20260914073000_reconcile_credit_purchase_debt.sql`

All migrations are additive to the child59 unlock/ledger foundation. `credit_ledger` remains append-only.

## Preview runtime

For entitlement testing only:

- `PUBLIC_TRANSLATION_CREDITS_ENABLED=true`
- keep `LIBREAD_CREDIT_PURCHASE_ENABLED=false` unless a Stripe **test-mode** catalog and webhook are configured.

Original public reading remains available without translation entitlement. Public Bilingual / Translation-only access becomes account-bound when the feature flag is enabled.

Server-side priority is authoritative even for direct API calls:

1. existing unlock
2. included daily allowance
3. purchased credit

A client cannot force a credit debit while included allowance remains by spoofing the unlock method.

## Approved Live credit catalog

Approved on 2026-09-14:

| Pack ID | Credits | Price | Expiration | Stripe Product | Stripe Price |
| --- | ---: | ---: | ---: | --- | --- |
| `credits_5` | 5 | ¥300 | 150 days | `prod_VFratXRAVtsp5w` | `price_1UFLrkLuEpSwUk8MmDN2oYv1` |
| `credits_8` | 8 | ¥450 | 150 days | `prod_VFrblDBc1RRuRs` | `price_1UFLroLuEpSwUk8M3T4fla86` |
| `credits_12` | 12 | ¥600 | 150 days | `prod_VFrbx1mgcdrJuu` | `price_1UFLryLuEpSwUk8MMmg0Ubt1` |

These are Live-mode Stripe resources, but no Payment Link has been created and the application purchase flag remains disabled. Creation of Stripe Product/Price resources alone does not enable LIB read credit sales.

Intended production catalog value after the remaining rollout gates are satisfied:

```json
[
  {
    "id": "credits_5",
    "credits": 5,
    "stripePriceId": "price_1UFLrkLuEpSwUk8MmDN2oYv1",
    "displayPriceJpy": 300,
    "currency": "jpy",
    "expiresInDays": 150
  },
  {
    "id": "credits_8",
    "credits": 8,
    "stripePriceId": "price_1UFLroLuEpSwUk8M3T4fla86",
    "displayPriceJpy": 450,
    "currency": "jpy",
    "expiresInDays": 150
  },
  {
    "id": "credits_12",
    "credits": 12,
    "stripePriceId": "price_1UFLryLuEpSwUk8MMmg0Ubt1",
    "displayPriceJpy": 600,
    "currency": "jpy",
    "expiresInDays": 150
  }
]
```

## Live credit sales gate

Do not enable Live credit sales until all of the following are approved/configured:

- pack credit quantities and JPY prices — **approved**
- expiration period — **approved: 150 days**
- Live Stripe Product/Price IDs — **created**
- `LIBREAD_CREDIT_PACK_CATALOG_JSON`
- `LIBREAD_CREDIT_TERMS_VERSION`
- `LIBREAD_CREDIT_PURCHASE_ENABLED=true`
- legal seller details and existing Stripe billing configuration
- `/commercial-transactions` reflects the approved catalog

`isCreditPurchaseEnabled()` intentionally fails closed unless these prerequisites are present.

## Backfill

No grandfather backfill is included. Existing DB records do not provide reliable historical `(user_id, episode_id, target_language)` reading entitlements: public translation assets are shared and generation requester metadata is not proof of reading.

## Validation commands

```bash
npx tsc --noEmit
npm run test:translation-credit-runtime
npm run test:stripe-credit-webhook
npm run test:translation-consistency
npm run test:bilingual-reading
npm run test:multilingual-work-reader
npm run test:en-ko-i18n
npm run lint -- src/app/api/billing/credits/checkout/route.ts src/app/api/billing/webhook/route.ts src/app/api/episode-translations src/app/mypage src/app/commercial-transactions/page.tsx src/features/playback/PublicTranslationUnlockGate.tsx src/features/playback/ReadBilingualShell.tsx src/lib/aiUsage/aiUsage.server.ts src/lib/billing/creditPackCatalog.ts src/lib/translation/executeEpisodeTranslationGeneration.ts src/lib/translation/publicTranslationCreditPolicy.ts src/lib/translation/publicTranslationCredits.server.ts scripts/test-public-translation-credit-runtime.ts scripts/test-stripe-credit-webhook.ts
npm run build
git diff --check
git diff --cached --check
git status
```

## Current verification status

- Vercel Preview build for commit `98bd7cb789a2e6f78e3596c640c7b8725fc972fa`: **READY**.
- Next.js production compilation: **passed**.
- Next.js build-time TypeScript phase: **passed**.
- Static page generation: **87/87 passed**.
- Preview deployment: **completed successfully**.
- `/commercial-transactions` on Preview: **HTTP 200**. Credit sales remain fail-closed because required seller details are not fully configured.
- Local checkout execution is unavailable in the current agent runtime because outbound GitHub DNS is blocked; therefore standalone test scripts, scoped ESLint, and git diff checks still require a checkout/CI environment.
- Supabase is now connected and exposes database actions in this session. The only available Supabase project has no development branches, so the four new migrations have deliberately **not** been applied to the production database without a separate rollout decision.
- The exposed Vercel connector still does not provide environment-variable mutation, so Preview enforcement has not been switched on by this agent.
- Live Stripe Products/Prices for the approved three-pack catalog have been created. No Payment Link was created and `LIBREAD_CREDIT_PURCHASE_ENABLED` has not been enabled.

Production merge and feature-flag activation require explicit user approval after Preview verification.
