# Shared translations, unlocks, and credits foundation

## Scope

This foundation prepares LIB read for shared public translation assets and future credit-backed per-language unlocks without changing the current Production quota or Reader behavior.

This phase intentionally does **not**:

- sell credits,
- seed existing users with credits,
- enforce credits in the public Reader,
- replace the current Free/Premium daily quotas,
- backfill historical translation reads as unlocks,
- merge private-library translations into the public cache.

## Existing public translation architecture

`public.episode_translations` is already a shared, service-role-only public episode translation cache. It is not keyed by user ownership. `requested_by_user_id` records the request that created/refreshed a row but is not part of cache identity or access control.

Current multilingual cache identity is:

```text
episode_id
+ source_language
+ target_language
+ source_hash
```

The current `reserve_episode_translation_v2` RPC serializes generation for that identity with a PostgreSQL transaction advisory lock. A second request for the same identity sees either `ready` or `in_progress` rather than starting another OpenAI generation.

Therefore this phase does not add a duplicate translation-assets table. `episode_translations` remains the shared asset store.

## Current source hash and translation profile caveat

The application currently builds `source_hash` from normalized episode source text and may include the series-level translation learning preference as a cache variant. That preference is stored on the work/series; it is not a requesting reader's personal setting.

Consequences:

- current shared rows do not leak the first reader's private learning preference,
- a work-level learning profile can still create a different translation variant,
- historical/current rows must not be blindly reclassified as a future canonical `standard` profile based only on the hash.

A later translation-quality/profile migration can add explicit canonical profile/version metadata without changing user unlock identity.

## Access boundary

A translation asset or unlock never grants access to the underlying episode.

The existing public translation resolver remains authoritative for:

- series publication state,
- episode publication/visibility,
- owner access,
- R18 viewer preference,
- translation permission/eligibility,
- explicit preview/official-account exceptions already used by Production.

The foundation RPC is not wired into the Reader. Future server integration must resolve the authenticated user and pass all normal episode access checks before using an unlock.

## Private library isolation

`public.private_library_chapter_translations` remains an independent owner-only cache. It is not referenced by the public unlock or credit schema.

Unsaved generated stories and other private/imported content likewise remain outside public translation unlocks.

## Public episode translation unlocks

`public.public_episode_translation_unlocks` represents a user's entitlement to a target-language translation for an otherwise accessible public episode.

Identity is case-insensitively unique on:

```text
user_id
+ episode_id
+ target_language
```

`source_hash` is deliberately absent.

This guarantees that editing the episode and generating a new shared asset does not require the same user to pay again for the same target language.

Different target languages remain separate unlocks. Source-language == target-language unlock requests are rejected by the atomic RPC.

## Credit ledger

`public.credit_ledger` is the source of truth for credit balance.

Balance is:

```sql
sum(amount)
```

There is no independently mutable `profiles.credits` balance column.

The ledger is append-only at the database layer. `UPDATE` and `DELETE` raise an error even for privileged application callers; refunds, corrections, expirations, and adjustments must be new compensating entries.

Each user's `idempotency_key` is unique.

Authenticated clients have read-only access to their own ledger rows through RLS and cannot insert arbitrary positive amounts.

## Atomic unlock

`public.unlock_public_episode_translation(...)` is service-role-only and is not used by Production in this phase.

For a future server request it:

1. validates identifiers and source/target language distinction,
2. obtains a user-level credit-balance advisory lock,
3. obtains an entitlement-specific advisory lock,
4. returns the existing unlock without charging if already unlocked,
5. calculates balance from the append-only ledger,
6. rejects insufficient balance,
7. inserts the unlock and the `-1` ledger entry in the same database transaction.

The user-level lock is required in addition to the entitlement lock: without it, simultaneous unlocks for two different episodes could both observe the same final credit and overspend the balance.

Future balance-changing RPCs should use the same `credit-balance:<user_id>` advisory-lock namespace before checking or consuming balance.

## Idempotency

Two independent protections apply:

- unlock uniqueness prevents duplicate entitlements for the same user/episode/target language,
- `(user_id, idempotency_key)` uniqueness prevents duplicate ledger operations.

A retry after a successful unlock returns `already_unlocked` with `charged = false`.

## Existing quota remains authoritative

Current Production quota behavior is unchanged because no current translation endpoint calls the new unlock/credit RPC.

In particular, the existing public translation generation route checks for a `ready` or `translating` shared cache row before calling the daily AI-action reservation. Current cache hits therefore remain quota-free in this phase.

The credit foundation is dormant until a later explicitly enabled rollout.

## Migration rollout

Migration:

```text
supabase/migrations/20260912100000_add_public_translation_unlocks_credit_ledger.sql
```

It is additive. Existing translation rows are not rewritten or deleted, no user receives a credit grant, and no existing API depends on the new objects immediately after migration.

Read-only catalog verification:

```text
supabase/verification/20260912100000_verify_public_translation_unlocks_credit_ledger.sql
```

Apply the migration to the shared Supabase project manually, run the verification SQL, then perform Preview integration testing before enabling any application enforcement.