import assert from "node:assert/strict";
import { fetchReaderCardLikeSnapshotMap } from "../src/lib/readerCardLike";

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

function asObject(map: Map<string, unknown>) {
  return Object.fromEntries(map);
}

async function main() {
  // Empty series id or no keys: no query at all.
  const idle = createSupabaseMock(() => ({ data: [], error: null }));
  assert.equal((await fetchReaderCardLikeSnapshotMap({ supabase: idle.client, seriesId: " ", readerKeys: ["k"] })).size, 0);
  assert.equal((await fetchReaderCardLikeSnapshotMap({ supabase: idle.client, seriesId: "s", readerKeys: [" ", ""] })).size, 0);
  assert.equal(idle.queries.length, 0);

  const mock = createSupabaseMock(() => ({
    data: [
      { reader_key: "nemo:A", user_id: "viewer-1" },
      { reader_key: "nemo:A", user_id: "other" },
      { reader_key: " aivis:B ", user_id: "other" },
      { reader_key: "", user_id: "viewer-1" },
      { reader_key: 5, user_id: "viewer-1" },
    ],
    error: null,
  }));
  const map = await fetchReaderCardLikeSnapshotMap({
    supabase: mock.client,
    seriesId: " series-1 ",
    readerKeys: [" nemo:A ", "nemo:A", "aivis:B", "user-3"],
    currentUserId: " viewer-1 ",
  });
  assert.deepEqual(mock.queries, [
    {
      table: "reader_card_likes",
      calls: [
        ["select", "reader_key, user_id"],
        ["eq", "series_id", "series-1"],
        ["in", "reader_key", ["nemo:A", "aivis:B", "user-3"]],
      ],
    },
  ]);
  assert.deepEqual(asObject(map), {
    "nemo:A": { likeCount: 2, isLiked: true },
    "aivis:B": { likeCount: 1, isLiked: false },
    "user-3": { likeCount: 0, isLiked: false },
  });
  assert.deepEqual([...map.keys()], ["nemo:A", "aivis:B", "user-3"]);

  // Without a viewer nothing is marked liked.
  const anonymous = await fetchReaderCardLikeSnapshotMap({
    supabase: createSupabaseMock(() => ({ data: [{ reader_key: "k", user_id: "" }], error: null })).client,
    seriesId: "s",
    readerKeys: ["k"],
    currentUserId: null,
  });
  assert.deepEqual(asObject(anonymous), { k: { likeCount: 1, isLiked: false } });

  // null data is treated as no rows.
  const nullData = await fetchReaderCardLikeSnapshotMap({
    supabase: createSupabaseMock(() => ({ data: null, error: null })).client,
    seriesId: "s",
    readerKeys: ["k"],
  });
  assert.deepEqual(asObject(nullData), { k: { likeCount: 0, isLiked: false } });

  await assert.rejects(
    fetchReaderCardLikeSnapshotMap({
      supabase: createSupabaseMock(() => ({ error: { message: "boom" } })).client,
      seriesId: "s",
      readerKeys: ["k"],
    }),
    /reader_card_likes lookup failed: boom/
  );

  console.log("PASS: reader card like snapshot map (query, de-dup/trim, counts, liked state, errors)");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
