# Child84 — Public DB timeout phase evidence, 2026-10-11

## Decision

**Corroborated: an extreme observed 83.379-second timeout was almost entirely a late JavaScript timeout callback, not slow promise settlement after abort.**

**Not yet established:** why the callback ran late. Possible explanations include a blocked event loop, a suspended/paused function execution environment or other runtime scheduling delays. This does **not** justify asserting that Supabase itself took 83 seconds, or that Vercel Fluid Compute is definitely enabled or caused the delay.

## Grounded Production observations

After merged PR #116 (main `7d4e5c909ed22ec5ee798b913ce32fefb5fb6311`, Production READY), the new numeric, endpoint-only diagnostic logged this example:

| Detail | Observed value |
| --- | --- |
| Timestamp | 2026-10-11 01:38:44 UTC |
| Route type | Localized login (the route path and user/request IDs are **not** recorded by our diagnostic payload) |
| Vercel execution region | sfo1, according to Vercel's host log envelope |
| Allowlisted Supabase endpoint | series |
| Configured local abort deadline | 2,500 ms |
| Total elapsed in diagnostic | **83,379 ms** |
| Deadline-timer callback delay beyond target | **80,876 ms** |
| Time from timer callback through fetch rejection | **3 ms** |

The three values obey the expected decomposition: 2,500 + 80,876 + 3 = 83,379 ms. This is one incident, not an overall histogram.

Earlier, a 30-minute window of Vercel Production logs yielded **seven** `[public-db-local-timeout]` warnings (multiple endpoints/regions); some old-format elapsed values were well over a minute. These seven warnings were observed events, **not a request denominator, failure rate or complete outage count**. Deployment scope and exact log windows must be preserved when comparing future observations.

Supabase Production at the time was `ACTIVE_HEALTHY`. A read-only `pg_stat_statements` grouped-fingerprint query returned:

| Query family | Fingerprints | Cumulative calls | Call-weighted mean exec | Maximum observed exec |
| --- | ---: | ---: | ---: | ---: |
| public.series patterns | 52 | 1,817 | 0.79 ms | 13.26 ms |
| public_episode_work_summaries patterns | 21 | 198 | 26.30 ms | 106.24 ms |

These DB times are **cumulative across the extension's statistics interval, not timestamp-matched to the Vercel failures**. The query-family substring grouping may include related SQL. Therefore they show normal-time query performance, but do not rule out isolated slow SQL at another time. At the read-only snapshot there was one active client backend and zero lock-wait backends.

## Safe operational follow-up

1. Continue collecting numeric `elapsedMs`, `deadlineTimerDelayMs` and `abortSettlementDelayMs` from the **existing** `[public-db-local-timeout]` warning, grouped by deployment/region and allowlisted endpoint **outside the payload** through privileged Vercel logs. Do not log raw URLs, request bodies, auth headers, query strings, service keys, private user IDs, or Work/episode identifiers.
2. Treat high `deadlineTimerDelayMs` as timer-execution delay; treat high `abortSettlementDelayMs` as delayed post-abort settlement. Both can coexist. Neither alone proves the infrastructure vendor's underlying cause.
3. Use Vercel's deployment/runtime settings and logs to determine whether scheduling pauses or shared CPU contention correlate with the spikes. Current project connection did not verify whether Fluid Compute is enabled; do not attribute causality to it.
4. Avoid blind 2,500-ms deadline increase, SQL query rewrite, Vercel region relocation, stale public snapshot/replica or DB read-replica adoption. The rejected #106 Singapore preview and incomplete deletion/tombstone boundary remain applicable.
5. If a controlled candidate emerges, isolate it in Draft/Preview with an unchanged published-only/R18/privacy authorization gate, measure route success and p95 against the current Production deployment, obtain explicit user approval and then verify after merge.
6. Re-check short-retention Vercel logs while they are still available. Lack of a new warning in a few minutes is **not** proof of resolution.

## Sources and fixed boundaries

- Vercel runtime warning and error-group observations obtained by the authorized Vercel integration, not public search.
- PostgreSQL cumulative execution times obtained using the authorized Supabase integration in `BEGIN READ ONLY` SQL. No DB writes.
- Vercel docs on [Fluid Compute](https://vercel.com/docs/fluid-compute), [Function configuration](https://vercel.com/docs/functions/configuring-functions) and [Function duration](https://vercel.com/docs/functions/configuring-functions/duration) provide possible platform context; **not** proof of this project's current enabled settings.
- Implementation: `src/lib/supabase/serverPublic.ts`; regression: `scripts/test-public-fetch-timeout-diagnostics.ts`.
- Child84 remains **NOT DONE**, Child85 **BLOCKED**. Backup/restore, full Search SQL parity, deletion/tombstone, authenticated Reader/R18/author E2E and Cron Production release remain unverified.

