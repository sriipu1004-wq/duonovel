# Public translation credit runtime audit

## Quota compatibility

- Free keeps the existing shared 3/day bucket because private-library imports reserve `story_generation`, while public translation unlocks reserve `translation_generation`; the existing Free quota scope counts both action types.
- Premium keeps story generation separate and counts only `translation_generation` toward the 30/day public translation allowance.
- With credit enforcement enabled, public translation AI generation no longer reserves daily action quota. The entitlement finalization is the single user-allowance event.
- Existing same-day `translation_generation` rows from before a feature-flag switch remain counted, preventing an accidental second allowance on rollout day.

## Asset / entitlement / billing separation

- `episode_translations` remains the shared asset cache keyed by source identity/hash.
- `public_episode_translation_unlocks` remains per-user entitlement keyed by episode and target language, independent of source hash.
- `credit_ledger` remains the append-only monetary entitlement ledger.

## Anonymous compatibility

- Feature flag off: existing anonymous translation behavior remains unchanged.
- Feature flag on: Original public reading remains anonymous; translated modes require an account-bound entitlement.

## Backfill decision

No grandfather migration is included. Existing shared translation generation records do not prove that a specific user read a specific target-language translation, and local reader history is not a trustworthy server-side entitlement source.

## Credit expiration and reversals

- Purchased credits are represented by additive purchase lots with mandatory expiration.
- Active purchased credits are consumed earliest-expiry-first.
- Expiration writes an append-only compensating negative ledger row.
- Full refunds/disputes write append-only negative ledger rows and do not revoke past episode unlocks.
- Aggregate balances may become negative; subsequent unlocks are blocked until the balance is positive again.
- A later purchase first offsets any negative aggregate balance before the remaining purchased quantity is marked as expirable/spendable in its purchase lot.

## Security boundaries

- Client never supplies credit quantity, price, unlock source, or a trusted user ID.
- Translation payload is withheld server-side until entitlement exists when enforcement is enabled.
- Existing publication, R18, source-language, and translation-permission checks run before unlock/debit.
- Stripe webhook retains signature verification and event-id idempotency; catalog price ID is revalidated server-side.
