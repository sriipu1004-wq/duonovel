# Public translation credit runtime rollout

This runtime is production-active when `PUBLIC_TRANSLATION_CREDITS_ENABLED=true`.

## Required database migrations

Apply, in order:

1. `20260914070000_add_public_translation_credit_runtime.sql`
2. `20260914071000_enforce_credit_purchase_expiration.sql`
3. `20260914072000_fix_credit_unlock_append_only.sql`
4. `20260914073000_reconcile_credit_purchase_debt.sql`

All migrations are additive to the child59 unlock/ledger foundation. `credit_ledger` remains append-only.

## Runtime priority

Server-side priority is authoritative even for direct API calls:

1. existing unlock
2. included daily allowance
3. purchased credit

A client cannot force a credit debit while included allowance remains by spoofing the unlock method.

The Reader requires explicit confirmation before consuming either an included translation allowance or a purchased credit. If a translation asset is missing, the confirmation copy tells the reader that AI generation will run. Existing unlocks never require confirmation or a second charge.

## Reader simplification

- The duplicate title-area bilingual ON/OFF controls are removed from the active Reader surface; mode switching remains in the primary Reader mode selector.
- Tap-to-word AI explanation is disabled in the public bilingual pane because the current latency is not appropriate for an inline dictionary interaction.
- Same episode + same target-language unlock remains reusable without further allowance/credit consumption.

## Workspace follow-up

- Long episode lists are capped to a stable workspace height and scroll internally.
- Original-language settings and translation glossary tools are rendered inside the work-status area rather than as standalone workspace cards.

## Approved Live credit catalog

Approved on 2026-09-14:

| Pack ID | Credits | Price | Expiration | Stripe Product | Stripe Price |
| --- | ---: | ---: | ---: | --- | --- |
| `credits_5` | 5 | ¥300 | 150 days | `prod_VFratXRAVtsp5w` | `price_1UFLrkLuEpSwUk8MmDN2oYv1` |
| `credits_8` | 8 | ¥450 | 150 days | `prod_VFrblDBc1RRuRs` | `price_1UFLroLuEpSwUk8M3T4fla86` |
| `credits_12` | 12 | ¥600 | 150 days | `prod_VFrbx1mgcdrJuu` | `price_1UFLryLuEpSwUk8MMmg0Ubt1` |

These are Live-mode Stripe resources. No Payment Link is used; LIB read creates one-time Stripe Checkout Sessions server-side.

Production catalog value:

```json
[
  {
    "id": "credits_5",
    "credits": 5,
    "stripePriceId": "price_1UFLrkLuEpSwUk8MmDN2oYv1",
    "displayPriceJpy": 300,
    "currency": "JPY",
    "expiresInDays": 150
  },
  {
    "id": "credits_8",
    "credits": 8,
    "stripePriceId": "price_1UFLroLuEpSwUk8M3T4fla86",
    "displayPriceJpy": 450,
    "currency": "JPY",
    "expiresInDays": 150
  },
  {
    "id": "credits_12",
    "credits": 12,
    "stripePriceId": "price_1UFLryLuEpSwUk8MMmg0Ubt1",
    "displayPriceJpy": 600,
    "currency": "JPY",
    "expiresInDays": 150
  }
]
```

## Credit store

A dedicated authenticated `/credits` page is the canonical purchase surface. It shows current balance, usage rules, pack prices, expiration, legal links, and the terms acknowledgement required before starting Stripe Checkout.

Checkout success/cancel returns to `/credits`. The Reader purchase-required state and My Page credit card link directly to the store.

## Live credit sales gate

Live credit sales remain fail-closed unless all of the following are configured:

- approved pack quantities and prices
- approved expiration period: 150 days
- Live Stripe Product/Price IDs
- `PUBLIC_TRANSLATION_CREDITS_ENABLED=true`
- `LIBREAD_CREDIT_PACK_CATALOG_JSON`
- `LIBREAD_CREDIT_TERMS_VERSION`
- `LIBREAD_CREDIT_PURCHASE_ENABLED=true`
- complete legal seller details
- existing Stripe billing configuration

`isCreditPurchaseEnabled()` intentionally fails closed unless all prerequisites are present.

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
npm run lint -- src/app/api/billing/credits/checkout/route.ts src/app/api/billing/webhook/route.ts src/app/api/episode-translations src/app/credits src/app/mypage src/app/commercial-transactions/page.tsx src/features/playback/PublicTranslationUnlockGate.tsx src/features/playback/ReadBilingualShell.tsx src/features/playback/BilingualPane.tsx src/features/write/SeriesStatusPortal.tsx src/features/write/SourceLanguageWorkspaceBridge.tsx src/features/write/SeriesTranslationGlossaryWorkspace.tsx src/lib/aiUsage/aiUsage.server.ts src/lib/billing/creditPackCatalog.ts src/lib/translation/executeEpisodeTranslationGeneration.ts src/lib/translation/publicTranslationCreditPolicy.ts src/lib/translation/publicTranslationCredits.server.ts scripts/test-public-translation-credit-runtime.ts scripts/test-stripe-credit-webhook.ts
npm run build
git diff --check
git diff --cached --check
git status
```

## Current production checkpoint

- PR #32 was merged to `main` at `c6049b95cdee04a50f749b99eeb4fb1384da9088`.
- Production database migrations are applied.
- `PUBLIC_TRANSLATION_CREDITS_ENABLED=true` in Production.
- `LIBREAD_CREDIT_PURCHASE_ENABLED=false` at the last confirmed checkpoint, so Live credit sales are still closed.
- Production entitlement enforcement is active.
- Live Stripe Products/Prices exist for the approved catalog.
- Existing production Stripe webhook receives checkout completion, async payment success, full refund, and dispute-created events required by this runtime.

## Follow-up branch

`fix/confirm-public-translation-unlock` / PR #33 contains the Reader confirmation fix, Reader simplification, workspace layout changes, and dedicated credit store. Do not enable Live credit sales until this follow-up is merged and its Production deployment is verified.
