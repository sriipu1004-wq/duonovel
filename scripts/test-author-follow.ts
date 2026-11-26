import assert from "node:assert/strict";
import { fetchAuthorFollowSnapshot } from "../src/lib/authorFollow";

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

function isCountQuery(calls: Call[]) {
  return calls.some((call) => call[0] === "select" && JSON.stringify(call[2]) === JSON.stringify({ count: "exact", head: true }));
}

async function main() {
  // Counts and current follow state; ids are trimmed.
  const ok = createSupabaseMock((_table, calls) => {
    if (isCountQuery(calls)) {
      const column = calls.find((call) => call[0] === "eq")?.[1];
      return { count: column === "followed_author_id" ? 7 : 3, error: null };
    }
    return { data: { id: 1 }, error: null };
  });
  assert.deepEqual(
    await fetchAuthorFollowSnapshot({ supabase: ok.client, authorId: " author-1 ", currentUserId: " viewer-1 " }),
    { followerCount: 7, followingCount: 3, isFollowing: true }
  );
  assert.deepEqual(ok.queries.map((query) => query.table), ["author_follows", "author_follows", "author_follows"]);
  assert.deepEqual(ok.queries[0]?.calls, [
    ["select", "id", { count: "exact", head: true }],
    ["eq", "followed_author_id", "author-1"],
  ]);
  assert.deepEqual(ok.queries[1]?.calls, [
    ["select", "id", { count: "exact", head: true }],
    ["eq", "follower_user_id", "author-1"],
  ]);
  assert.deepEqual(ok.queries[2]?.calls, [
    ["select", "id"],
    ["eq", "follower_user_id", "viewer-1"],
    ["eq", "followed_author_id", "author-1"],
    ["maybeSingle"],
  ]);

  // No viewer: only the two count queries; null/NaN counts become 0.
  const anonymous = createSupabaseMock(() => ({ count: null, error: null }));
  assert.deepEqual(
    await fetchAuthorFollowSnapshot({ supabase: anonymous.client, authorId: "author-1", currentUserId: "  " }),
    { followerCount: 0, followingCount: 0, isFollowing: false }
  );
  assert.equal(anonymous.queries.length, 2);
  const nan = createSupabaseMock(() => ({ count: Number.NaN, error: null }));
  assert.equal((await fetchAuthorFollowSnapshot({ supabase: nan.client, authorId: "a" })).followerCount, 0);

  // Each lookup error is reported with its own message.
  const failing = (which: number) =>
    createSupabaseMock((_table, calls) => {
      const column = calls.find((call) => call[0] === "eq")?.[1];
      const index = isCountQuery(calls) ? (column === "followed_author_id" ? 0 : 1) : 2;
      return index === which ? { error: { message: `boom${which}` } } : { count: 1, data: null, error: null };
    }).client;
  await assert.rejects(
    fetchAuthorFollowSnapshot({ supabase: failing(0), authorId: "a", currentUserId: "v" }),
    /author_follows follower count lookup failed: boom0/
  );
  await assert.rejects(
    fetchAuthorFollowSnapshot({ supabase: failing(1), authorId: "a", currentUserId: "v" }),
    /author_follows following count lookup failed: boom1/
  );
  await assert.rejects(
    fetchAuthorFollowSnapshot({ supabase: failing(2), authorId: "a", currentUserId: "v" }),
    /author_follows current follow lookup failed: boom2/
  );

  console.log("PASS: author follow snapshot (queries, trimming, counts, viewer state, errors)");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
