# Issue #137 — Production cache AbortError / S4 read-only triage (2026-10-21)

Scope: **S4 only**, parent-managed serial workflow; independent S1 review must occur **after** S4 freezes a Draft PR HEAD. This is investigation plus bounded source-only candidates, **not** a Production incident resolution or approval to merge. Prior Child84 was operationally closed with documented deferrals; its upstream/timer root cause was not certified.

## Exact independent baseline

- GitHub `main`: `37650ac9b391c1a76f597751ea44c6110541a697` (merged Child85 source-only PR #135).
- Vercel Production: `dpl_3Zhkw9WLfYmdzChM2LRRQDNLpXCL`, READY, commit exactly `37650ac9b391c1a76f597751ea44c6110541a697`, public alias `www.syosetu-libread.com`; function deployment metadata region `iad1`.
- Open PRs inspected: #145 parent governance Draft, #136 older governance Draft, #131 legacy metadata Draft, #108 Cron Draft. #131 is **unmerged** and is a reference/candidate only; the current proposal branches from live main, **not** from its stale base. No old roadmap state was imported.
- Deployment and raw logs are time-sensitive snapshots, not a current 5xx rate. No Production environment, Auth, database, storage, permission, or cache configuration was changed.

## Evidence, with boundaries

1. Vercel grouped runtime error clusters during a one-hour query showed 14 catalog revalidation records, 7 recording-aggregate revalidation records and 3 entries in a separate catalog group. These are **error occurrences**, not distinct failed HTTP requests or users. A separate recent 30-minute log-level aggregation showed 18 `error` and 12 `warn` entries; again these are **not** HTTP-status counts.
2. Raw Production event at **2026-10-21 09:04:35 UTC**, GET `/works/13d2a8a4-6873-4d18-9131-5822652d34dd`, deployment above, request region `iad1`: two `revalidating cache with key` errors (public-base-work-cards and public-recording-aggregates), and `[public-db-local-timeout]` on allowlisted `series`: local deadline 2,500 ms, total elapsed 18,017 ms, late deadline timer callback 15,515 ms, post-abort settlement 2 ms, CPU user 73 ms, CPU system 11 ms. The arithmetic is 2,500 + 15,515 + 2 = 18,017. **Do not attribute this delay to SQL execution**. Process CPU is not per-request. Request-path association does not prove synchronous catalog reads; background revalidation may be logged against unrelated pages. Observed edge/request-region labels are not proof of a different function deployment region.
3. Earlier Child84 phase evidence in `docs/child84-public-db-timeout-phase-evidence.md` observed an 83,379 ms elapsed timeout with 80,876 ms late callback and 3 ms settlement. Together the observations demonstrate recurring late JS deadline-callback dispatch, **not** the mechanism (event-loop starvation, runtime pause, upstream/network latency, and platform scheduling remain unresolved). Normal cumulative DB `pg_stat_statements` samples in the old audit are not request-correlated.
4. **One anonymous request each**, from a single remote test client, current Production, October 21 UTC ~09:06; response includes `x-vercel-id` with `hnd1::iad1`; these are NOT longitudinal p95, and HTTP 200 does not guarantee complete content:

| Route (representative exact public work ID above) | HTTP | Observed wall time (ms) | Body result |
| --- | ---: | ---: | --- |
| `/` | 200 | 1018 | Home title; no generic application error marker |
| `/en` | 200 | 341 | EN Home title |
| `/ko` | 200 | 470 | KO Home title |
| `/search` | 200 | 1370 | JA Search title |
| `/en/search` | 200 | 1106 | EN Search title |
| `/ko/search` | 200 | 1115 | KO Search title |
| `/works/<id>` | 200 | 3131 | **Incorrect SEO title `公開話なし | LIB read`**; body is nonzero |
| `/en/works/<id>` | 200 | 1959 | Correct Frankenstein title |
| `/ko/works/<id>` | 200 | 1916 | Correct Frankenstein title |
| `/read/<id>/1` | 200 | 2444 | Correct Frankenstein Reader title |
| `/en/read/<id>/1` | 200 | 2394 | Correct Frankenstein Reader title |
| `/ko/read/<id>/1` | 200 | 2397 | Correct Frankenstein Reader title |

No 5xx appeared in this 12-request sample; the denominator is **12 only**. Neither asynchronous revalidation errors nor zero 5xx in this sample supports a general availability claim. The JA Work title is independently a degraded 200/noindex case, not proof of missing chapters.

## Source-confirmed causes and bounded remedies

**Global cache failures:** `getCachedPublicBaseWorkCardsInternal` uses `unstable_cache` / 60-second `public-base-work-cards-v12-canonical-source-language`; the underlying Supabase public reads have a 2,500-ms local `AbortSignal` timer and may abort during revalidation. The *root cause of delayed timer callback* remains UNKNOWN. Recording aggregates are an independent failing revalidation key. **No TTL/timeout increase, suppressed exception, stale public-data mirror, region change, or logging of work/user identifiers is proposed.**

**Avoidable optional Work metadata dependency (from legacy #131, freshly compared to current main):** `/en/works/[seriesId]` and `/ko/works/[seriesId]` previously fetched the **whole** cached public-work catalog for one work's metadata. The candidate fetches only the requested public `series` ID and its posted+published episode summary (plus optional author profile), reusing the canonical card mapper. No separate stale cache. Public status, canonical source language, R18 viewer preference, source-language search filter, and published-episode gates remain fail-closed; failures produce generic noindex/nofollow metadata. This avoids one global revalidation dependency **only for localized Work metadata**, not the Home/Search catalog, related-works section, narration aggregates or platform callback delay. It may trade a warm cached global lookup for a per-work DB read, so exact traffic/latency impact needs a Preview and Production approval gate.

**Independent JA Work SEO defect confirmed by the HTTP sample and source:** `fetchFirstPublicEpisode` already SQL-filters for `posting_status=posted` and `is_published=true`, but its `WORK_PAGE_EPISODE_NAV_SELECT` returned only `id,episode_number`. It subsequently invoked `isEpisodePubliclyVisible`, which correctly fails closed when those two publication fields are missing. Thus a real public work was mislabeled `公開話なし`/noindex on 200. The small fix selects `posting_status,is_published` as well, without weakening the predicate or changing the DB filter. Regression exercises a true published row and draft/unpublished/partial denials. This is a **separate deterministic bug**, not proof of AbortError causality.

## Validation and acceptance boundary

Run `scripts/test-child84-locale-work-metadata-fallback.ts`, `scripts/test-public-read-reliability-performance.ts`, `scripts/test-public-fetch-timeout-diagnostics.ts`, new `scripts/test-issue137-work-metadata-visibility.ts`, SEO, locale, Search and security regression suites; require lint/typecheck/build. Build must use isolated **synthetic** environment placeholders (absence of real environment is expected); do not copy Production secrets. GitHub CI and Vercel Preview must be evaluated against **the exact Draft PR HEAD**, and anonymous Home/Search/Work/Reader JA/EN/KO checked again. Preview results and any disagreements should be appended to the task PR, not interpreted as Production release evidence.

Do not merge before explicit user approval. Parent later assigns S1 independent Work/R18/publication/source-language/translation semantic review; S4 must not self-assign it. The 60-second catalog TTL, cache tag behavior, Reader three modes, source-language Search, AI/Human provenance and credits, Public Domain rights gates, ownership, R18, and Production data remain unchanged. No new data migration. This code cannot establish sustained p95 reduction, a 5xx rate, authenticated E2E, or root-cause elimination; source/Preview acceptance is not a Production fix.
