import assert from "node:assert/strict";
import { fetchAuthorProfileLikeSnapshot } from "../src/lib/authorProfileLike";

// Characterization test: pins current behavior only (LT-002). Mocked Supabase, synthetic ids.

type Call = [string, ...unknown[]];
type Result = { data?: unknown; count?: number | null; error: { message: string } | null };

// Minimal Supabase query-builder mock: records the call chain and resolves via `respond`.
function createSupabaseMock(respond: (table: string, calls: Call[]) => Result) {
  const queries: Array<{ table: string; calls: Call[] }> = [];
  return {
    queries,
    client: {
      from(table: string) {
        const calls: Call[] = [];
        queries.push({ table, calls });
        const builder = {
          select: (...args: unknown[]) => (calls.push(["select", ...args]), builder),
          eq: (...args: unknown[]) => (calls.push(["eq", ...args]), builder),
          in: (...args: unknown[]) => (calls.push(["in", ...args]), builder),
          maybeSingle: () => (calls.push(["maybeSingle"]), Promise.resolve(respond(table, calls))),
          then: (resolve: (value: Result) => unknown, reject?: (reason: unknown) => unknown) =>
            Promise.resolve(respond(table, calls)).then(resolve, reject),
        };
        return builder;
      },
    },
  };
}

async function main() {
  const ok = createSupabaseMock((_table, calls) =>
    calls.some((call) => call[0] === "maybeSingle") ? { data: { id: 1 }, error: null } : { count: 4, error: null }
  );
  assert.deepEqual(
    await fetchAuthorProfileLikeSnapshot({ supabase: ok.client, authorId: " author-1 ", currentUserId: " viewer-1 " }),
    { likeCount: 4, isLiked: true }
  );
  assert.deepEqual(ok.queries.map((query) => query.table), ["author_profile_likes", "author_profile_likes"]);
  assert.deepEqual(ok.queries[0]?.calls, [
    ["select", "id", { count: "exact", head: true }],
    ["eq", "author_id", "author-1"],
  ]);
  assert.deepEqual(ok.queries[1]?.calls, [
    ["select", "id"],
    ["eq", "author_id", "author-1"],
    ["eq", "user_id", "viewer-1"],
    ["maybeSingle"],
  ]);

  const anonymous = createSupabaseMock(() => ({ count: null, data: { id: 1 }, error: null }));
  assert.deepEqual(
    await fetchAuthorProfileLikeSnapshot({ supabase: anonymous.client, authorId: "a", currentUserId: null }),
    { likeCount: 0, isLiked: false }
  );
  assert.equal(anonymous.queries.length, 1);

  const notLiked = createSupabaseMock(() => ({ count: 2, data: null, error: null }));
  assert.deepEqual(
    await fetchAuthorProfileLikeSnapshot({ supabase: notLiked.client, authorId: "a", currentUserId: "v" }),
    { likeCount: 2, isLiked: false }
  );

  const countError = createSupabaseMock(() => ({ error: { message: "boom" } }));
  await assert.rejects(
    fetchAuthorProfileLikeSnapshot({ supabase: countError.client, authorId: "a" }),
    /author_profile_likes count lookup failed: boom/
  );
  const likedError = createSupabaseMock((_table, calls) =>
    calls.some((call) => call[0] === "maybeSingle") ? { error: { message: "nope" } } : { count: 1, error: null }
  );
  await assert.rejects(
    fetchAuthorProfileLikeSnapshot({ supabase: likedError.client, authorId: "a", currentUserId: "v" }),
    /author_profile_likes liked lookup failed: nope/
  );

  console.log("PASS: author profile like snapshot (queries, trimming, count, liked state, errors)");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
