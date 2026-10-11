# Child84f — Search bookmarked-works correctness (Draft verification)

Status: implementation on a work branch; **NOT merged or Production accepted**.

## Cause

Normal `/search?saved=bookmarked-works` recognizes the saved-filter key,
but `SearchPageLegacy.tsx` had no branch loading
`public.user_series_bookmarks.series_id`. Its saved series-ID set stayed empty,
so bookmarked public works never matched.

Two adjacent failure modes could also make invalid "0 results" states:
saved lookup helper errors were converted to empty sets, and viewer Auth
timeouts were treated as signed-out state.

## Production read-only evidence (2026-10-11)

- Project `nyxbnccuvmlzffgtdadi` reported ACTIVE_HEALTHY.
- `public.user_series_bookmarks` has RLS enabled.
- SELECT policy `user_series_bookmarks_select_own`:
  `auth.uid() = user_id`; no wider SELECT policy was returned.
- Table SELECT is granted to `authenticated` and `anon`, but policy
  restricts visible rows to the authenticated request's own `user_id`.
- `id` is a unique primary key, usable for deterministic paging.
- Fields: `id`, `user_id`, `series_id`, `created_at`.
- No user bookmark rows or identifiers were accessed.
- No schema or RLS changes are required.

## Proposed implementation

- Use existing cookie-bound Supabase SSR client, never service_role.
- After `getUser()`, require `eq('user_id', currentUser.id)` and RLS.
- Read only `series_id`, `count:'exact'`, `order('id')`,
  `range(from,to)` in 500-row increments.
- Check all pages against the exact total. A short/failed page,
  missing count, invalid row or changing count is **unavailable**, not 0.
- Handle Auth unavailable separately from genuinely signed out.
- Propagate saved-list query errors for all existing saved-filter
  helpers instead of returning valid-looking empty sets.
- Continue intersecting saved IDs with the existing published/eligible
  public work catalog. Do not surface an owner's private bookmarked
  work in public Search; `/search/saved` remains a distinct surface.
- Preserve canonical matching, sorting, language/tag/genre facets,
  total count, 24/page URL pagination, and current popularity handling.
- No SQL Search paginator, TTL, DB writes, credits or translation edits.

## Verification gates

- Run `npm run test:child84-search-bookmarks` including 1,253 bookmark
  rows, page >1,000, exact-1,000 boundary, truncated intermediate pages,
  later-page failure, inconsistent count and private/out-of-catalog IDs.
- Run existing `npm run test:search-ux-final`, TypeScript, ESLint and build.
- Check Draft PR CI and Vercel Preview.
- Authenticated Preview E2E requires an authorized real user session.
  Without it, explicitly mark this gate **not verified**.
- Do not merge until explicit Preview approval. After merge, re-check
  Production `/search?saved=bookmarked-works` with authenticated viewer.

## PR #121 interaction

PR #121 is **audit-only, Draft and unmerged**. Its synthetic SQL-candidate
test deliberately supplies an empty `savedSeriesIds` set to reproduce
the old bug. **Do not interpret that fixture as a canonical requirement.**
If PR #121 is later adopted/rebased, replace the synthetic bookmarked
fixture with a populated owner-scoped set and revalidate result identity,
facet counts and pagination. Child84 as a whole remains IN PROGRESS.

Next workstream after this child: the account deletion / author-work
retention and non-publication policy, subject to parent scheduling.
