import assert from "node:assert/strict";
import Module from "node:module";

// Characterization test: pins current behavior only (LT-002).
// next/cache and the Supabase admin client are replaced in-process; no DB access.

type Row = Record<string, unknown>;
const state = {
  cacheArgs: [] as unknown[],
  pages: [] as Array<{ data: Row[] | null; error: { message: string } | null }>,
  log: [] as unknown[][],
};
const admin = {
  from(table: string) {
    const calls: unknown[] = [table];
    state.log.push(calls);
    const builder: Record<string, unknown> = {};
    for (const method of ["select", "in", "order"]) {
      builder[method] = (...args: unknown[]) => (calls.push([method, ...args]), builder);
    }
    builder.range = async (...args: unknown[]) => {
      calls.push(["range", ...args]);
      return state.pages.shift() ?? { data: [], error: null };
    };
    return builder;
  },
};

const moduleWithLoad = Module as unknown as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown;
};
const originalLoad = moduleWithLoad._load;
moduleWithLoad._load = function (request, parent, isMain) {
  if (request === "next/cache") {
    return {
      unstable_cache: <T,>(fn: T, keyParts: unknown, options: unknown) => {
        state.cacheArgs.push([keyParts, options]);
        return fn;
      },
    };
  }
  if (request === "@/lib/supabase/admin" || request.endsWith("/lib/supabase/admin")) return { createAdminClient: () => admin };
  return originalLoad.call(this, request, parent, isMain);
};

async function main() {
  try {
    const mod = await import("../src/lib/popularity");
    assert.deepEqual(state.cacheArgs, [[["series-popularity-daily-metrics-v1"], { revalidate: 15 }]]);

    // Score formula.
    assert.equal(mod.calculatePopularityScore({ likeCount: 2, bookmarkCount: 3, viewCount: 250 }), 2.5 + 2 + 1);
    assert.equal(mod.calculatePopularityScore({ likeCount: 0, bookmarkCount: 0, viewCount: 0 }), 0);
    assert.deepEqual(mod.createEmptyPopularityMetrics("s-1"), {
      seriesId: "s-1", likeCount: 0, bookmarkCount: 0, viewCount: 0, narrationPlayCount: 0, popularityScore: 0,
    });

    // Aggregation: snake_case first, camelCase fallback; unknown series dropped; listed series always present.
    const dataset = {
      seriesIds: ["a", "b"],
      dailyRows: [
        { series_id: " a ", bucket_date: "2026-11-01", like_count: 1, bookmark_count: 3, view_count: 100, narration_play_count: 2 },
        { seriesId: "a", bucketDate: "2026-11-02", likeCount: 2, bookmarkCount: 0, viewCount: 50, narrationPlayCount: 1 },
        { series_id: "a", bucket_date: "2026-11-03", like_count: Number.NaN, view_count: "7" as unknown as number },
        { series_id: "z", bucket_date: "2026-11-01", like_count: 99 },
        { series_id: "  ", like_count: 99 },
        { series_id: 5 as unknown as string, like_count: 99 },
      ],
    };
    const map = mod.buildSeriesPopularityMap(dataset);
    assert.deepEqual([...map.keys()], ["a", "b"]);
    assert.deepEqual(map.get("a"), {
      seriesId: "a", likeCount: 3, bookmarkCount: 3, viewCount: 157, narrationPlayCount: 3,
      popularityScore: mod.calculatePopularityScore({ likeCount: 3, bookmarkCount: 3, viewCount: 157 }),
    });
    assert.deepEqual(map.get("b"), mod.createEmptyPopularityMetrics("b"));

    // Window: compared by Tokyo calendar date, both ends inclusive; rows without a date are dropped.
    const t = (iso: string) => Date.parse(iso);
    const windowed = mod.buildSeriesPopularityMap(
      {
        seriesIds: ["a"],
        dailyRows: [
          { series_id: "a", bucket_date: "2026-10-31", like_count: 1 },
          { series_id: "a", bucket_date: "2026-11-01", like_count: 10 },
          { series_id: "a", bucket_date: "2026-11-02", like_count: 100 },
          { series_id: "a", bucket_date: "2026-11-03", like_count: 1000 },
          { series_id: "a", like_count: 10000 },
        ],
      },
      // 2026-10-31T15:00Z is 2026-11-01 00:00 in Tokyo; 2026-11-02T14:59Z is still 11-02 there.
      { startAtValue: t("2026-10-31T15:00:00Z"), endAtValue: t("2026-11-02T14:59:00Z") }
    );
    assert.equal(windowed.get("a")!.likeCount, 110);
    const startOnly = mod.buildSeriesPopularityMap(
      { seriesIds: ["a"], dailyRows: [{ series_id: "a", bucket_date: "2026-11-01", like_count: 1 }, { series_id: "a", like_count: 5 }] },
      { startAtValue: t("2026-10-31T14:59:00Z"), endAtValue: null }
    );
    assert.equal(startOnly.get("a")!.likeCount, 1);
    // A window with only null values counts as no window (undated rows kept).
    const noWindow = mod.buildSeriesPopularityMap(
      { seriesIds: ["a"], dailyRows: [{ series_id: "a", like_count: 5 }] },
      { startAtValue: null, endAtValue: null }
    );
    assert.equal(noWindow.get("a")!.likeCount, 5);

    // Fetch: ids trimmed, de-duplicated and sorted; paged by 1000; empty list -> no query.
    assert.deepEqual(await mod.fetchSeriesPopularityDataset([" ", ""]), { seriesIds: [], dailyRows: [] });
    assert.deepEqual(state.log, []);
    const fullPage = Array.from({ length: 1000 }, (_, i) => ({ series_id: "b", bucket_date: `d${i}` }));
    state.pages = [{ data: fullPage, error: null }, { data: [{ series_id: "a" }], error: null }];
    const fetched = await mod.fetchSeriesPopularityDataset(["b", " a ", "b"]);
    assert.deepEqual(fetched.seriesIds, ["a", "b"]);
    assert.equal(fetched.dailyRows.length, 1001);
    assert.deepEqual(state.log[0], [
      "series_popularity_daily",
      ["select", "series_id, bucket_date, like_count, bookmark_count, view_count, narration_play_count"],
      ["in", "series_id", ["a", "b"]],
      ["order", "series_id", { ascending: true }],
      ["order", "bucket_date", { ascending: true }],
      ["range", 0, 999],
    ]);
    assert.deepEqual((state.log as unknown[][])[1].at(-1), ["range", 1000, 1999]);
    // A page error throws (rows read so far are not returned).
    state.pages = [{ data: null, error: { message: "down" } }];
    await assert.rejects(mod.fetchSeriesPopularityDataset(["a"]), /^Error: series_popularity_daily read failed: down$/);

    console.log("popularity characterization: PASS");
  } finally {
    moduleWithLoad._load = originalLoad;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
