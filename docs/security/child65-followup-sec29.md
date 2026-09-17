# Child 65 follow-up addendum — SEC-29

## SEC-29 — P2 — AI usage error disclosure

Surface: `/api/ai-usage`.

Impact: when the AI usage snapshot failed, the route reflected `error.message` from the underlying server/provider path to the client. No secret value exposure was established, but raw Supabase/provider diagnostics are unnecessary client-visible information.

Fix:
- keep the original exception in a tagged server-side log;
- return the stable `ai_usage_unavailable` error code and generic Japanese message to the client;
- do not return `error.message`.

Regression: `scripts/test-security-authz.ts` verifies that the server diagnostic remains, raw exception text is not reflected, and the generic client message is present. `src/app/api/ai-usage/route.ts` is included in the focused security lint list.

No database migration is required.

## Deferred related hardening

The large `/api/time-fit-stories/generate` route still contains several legacy provider/internal error strings, including configuration-oriented failures. No secret key/token value exposure was established. Normalizing that route comprehensively is retained as bounded P2 work because a partial string-only rewrite inside the large generation path would create more feature-freeze regression risk than the information-disclosure reduction warrants.

The previously documented generated-story proof binding, time-fit count-then-write concurrency limit, Supabase leaked-password protection, translation GET timeout cleanup, and P3 SECURITY DEFINER/performance hardening remain unchanged.
