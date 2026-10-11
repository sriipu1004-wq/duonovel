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

## Child84d follow-up — 2026-10-11 read-only Production log sample

- Verified main and active Production deployment at `7c6f1e29fb5b8be7e2c49bd36d76278eba4e74d0` / `dpl_5Drn9DK8QhSCuehMC1qHsAWbrHSK`, READY. Vercel deployment lists `regions: ["iad1"]`, runtime logs use `nodejs24.x`.
- Approximate fixed log window 2026-10-11 01:30–02:20 UTC, Hobby retention <=1 hour. Exactly **11 visible `[public-db-local-timeout]` warnings**, across **4 merged Production deployments** (1 + 1 + 3 + 6), 10 `series` and one `public_episode_work_summaries`. These are warning events, not distinct requests, total requests, a failure rate, or a random sample.
- Of the 11 warnings, `deadlineTimerDelayMs` was **196–85,199 ms** (median **26,271 ms**). `abortSettlementDelayMs` was **1–5 ms**. Long callback delays occurred on multiple deployed SHAs and route types; PR #119 alone is not supported as an explanation. No pre-abort SQL execution time or full request latency distribution can be inferred.
- Runtime-log envelope `region` values were `iad1` (3), `cle1` (4), `sfo1` (3), `pdx1` (1), but **Vercel documents this log field as the edge request region**, which is distinct from a Function's execution location. All four deployment metadata records report `iad1`. Do not infer cross-region Function execution, failover, or a region root cause from the host-log region values.
- The existing timer uses `Date.now()`, so wall-clock adjustments can in principle affect its duration decomposition. The guarded Draft proposal adds `performance.now()` (monotonic elapsed + callback-delay comparison) and `process.cpuUsage()` (process-wide user/system CPU during the pending timer) as numeric-only diagnostic fields. CPU cannot be attributed to one request when multiple invocations share a process; small CPU delta does not by itself prove a suspended Function.
- Vercel project connection did not expose Fluid Compute enabled state or live CPU/memory utilization. Vercel's defaults for new projects since April 2025 make Fluid plausible, **not verified** for this project. The authenticated activity-events query returned HTTP 403; observability schema returned 404, so neither source establishes host scheduling behavior. Hobby runtime logs rejected a 6-hour query; short windows only.
- **Current outcome:** timer execution delay is corroborated across deployments; root cause remains **UNDETERMINED** between event-loop starvation, process scheduling/pauses, system-clock effects, and runtime infrastructure. No changes to deadlines, retries, region, cache TTL, public visibility or Production DB were authorized. The Draft diagnostic candidate must pass regression/CI/Preview and explicit user review before any Production merge. No causal conclusion should be drawn from Preview diagnostics until corresponding symptoms are actually observed.

## Sources and fixed boundaries

- Vercel runtime warning and error-group observations obtained by the authorized Vercel integration, not public search.
- PostgreSQL cumulative execution times obtained using the authorized Supabase integration in `BEGIN READ ONLY` SQL. No DB writes.
- Vercel docs on [Fluid Compute](https://vercel.com/docs/fluid-compute), [Function configuration](https://vercel.com/docs/functions/configuring-functions) and [Function duration](https://vercel.com/docs/functions/configuring-functions/duration) provide possible platform context; **not** proof of this project's current enabled settings.
- Implementation: `src/lib/supabase/serverPublic.ts`; regression: `scripts/test-public-fetch-timeout-diagnostics.ts`.
- Child84 remains **NOT DONE**, Child85 **BLOCKED**. Backup/restore, full Search SQL parity, deletion/tombstone, authenticated Reader/R18/author E2E and Cron Production release remain unverified.

## Child84 continuation — 2026-10-11 04:19:52–04:49:52 UTC, read-only Production observability

The following observations were obtained **without** source/runtime/configuration changes from
Vercel runtime logs against current `main` `b49e797313b0daf0d245e7e39e48dc22d520be7b`
(deployment `dpl_8hYNcAZsvzN8JcHu1iM1G4dQCYao`, READY).

- An exact **30-minute log window** returned **11** warning records matching
  `[public-db-local-timeout]`, all allowlisted `endpoint: 'series'`.
  Their configured deadline was 2,500 ms; observed `elapsedMs` ranged from
  **5,486 to 94,728 ms**.
- `deadlineTimerDelayMs` ranged from **2,984 to 92,226 ms**
  (the **median of these 11 warning events was 36,277 ms**).
  `abortSettlementDelayMs` was **1–2 ms** in every displayed case.
  The 94,728-ms event consisted of 2,500-ms nominal deadline,
  92,226-ms late timer callback, 2-ms abort settlement.
- `deadlineTimerCpuUserMs` ranged from **14 to 102 ms** among these events.
  That process-level CPU interval is not attributable to an individual
  request in shared concurrency; low CPU is **not proof** of a suspended
  Vercel function. Runtime host-log edge-region labels appeared varied,
  while deployment metadata continued to report the same function deployment;
  do not infer multi-region function execution.
- Separate 30-minute log-level aggregation at audit time yielded 17
  `error` and 11 `warn` log entries. These are log counts, **not**
  HTTP-error responses or independent end users; the queries are not
  a stable numerator/denominator for a rate.
- A separate 24-hour grouped-error view included 218 events attributed
  to a public-work-card cache-revalidation error group and 95 events
  for a Human-recording aggregate revalidation group on the newer
  production deployment. Those counts may reflect repeated revalidation
  and must not be treated as 218 or 95 failed users or as proof that
  stale/private data were returned.
- The Hobby log API refused a 24-hour raw-log read due to retention limits.
  The 30-minute raw-log sample and 24-hour *preaggregated* error grouping
  are different observability sources and must not be compared as an
  exact time-matched error rate.

**Interpretation:** Timer dispatch is still dramatically later than
the nominal 2,500-ms deadline in some cases, while promise settlement
immediately follows abort. Repeated `series` timeout warnings on
unrelated route types may also be background shared-cache revalidations;
the host-log request route alone does not prove that each unrelated page
synchronously requires the public catalog. Supabase gateway latency,
Vercel scheduling, process suspension, event-loop delay, runtime
resource contention and transient infrastructure faults remain
**undifferentiated causes**. Do not ascribe cause to the observed
host-log region, Supabase SQL, Fluid Compute or bots without stronger
correlated evidence.

**Safe next gate:** Obtain request-level duration and HTTP-status
denominators plus a time-matched correlation between
`[public-db-local-timeout]` and Vercel runtime scheduling/CPU
instrumentation in a representative authorized environment. Keep
the existing 2,500-ms deadline, 60-second public metadata TTL,
publication/R18 fail-closed checks and no-stale-public-mirror
decision unchanged. Do not 'solve' a delayed JavaScript timer by
claiming the deadline is reliable, by raising its duration, or by
publishing an unverified cache of withdrawn work.

This is an audit-only addition; it **does not** satisfy the
longitudinal p95 / end-to-end Reader acceptance gate.
Child84 NOT DONE; Child85 BLOCKED.
