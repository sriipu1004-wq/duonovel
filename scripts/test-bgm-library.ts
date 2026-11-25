import assert from "node:assert/strict";
import {
  fetchAllBgmLibraryTracks,
  fetchBgmLibraryFavoriteIds,
  fetchBgmLibraryTracks,
  findBgmLibraryTrack,
  mapBgmLibraryRow,
  resolveBgmLibraryTrackId,
  type SimpleSupabaseLike,
} from "../src/lib/bgm/bgmLibrary";

// Characterization test: pins current behavior only (LT-002). Mocked Supabase, synthetic rows.

type Call = [string, ...unknown[]];
type Result = { data: unknown[] | null; error: { message: string } | null };

function createSupabaseMock(result: Result) {
  const queries: Array<{ table: string; calls: Call[] }> = [];
  const client = {
    from(table: string) {
      const calls: Call[] = [];
      queries.push({ table, calls });
      const builder = {
        eq: (...args: unknown[]) => (calls.push(["eq", ...args]), builder),
        order: (...args: unknown[]) => (calls.push(["order", ...args]), builder),
        then: (resolve: (value: Result) => unknown, reject?: (reason: unknown) => unknown) =>
          Promise.resolve(result).then(resolve, reject),
      };
      return {
        select: (columns: string) => (calls.push(["select", columns]), builder),
      };
    },
  } as unknown as SimpleSupabaseLike;
  return { client, queries };
}

const defaults = mapBgmLibraryRow({ id: "bgm-1" });
assert.deepEqual(defaults, {
  id: "bgm-1",
  slug: "bgm-1",
  title: "無題BGM",
  description: "",
  mood: "未分類",
  useCase: "未分類",
  durationLabel: "不明",
  loopable: false,
  audioPath: "",
  sourceLabel: "サイト用意BGM",
  rightsLabel: "LIB read内利用想定",
  tags: [],
  isActive: true,
  sortOrder: 0,
});

const full = mapBgmLibraryRow({
  id: "bgm-2",
  slug: " calm ",
  title: " 静かな夜 ",
  loopable: 1 as unknown as boolean,
  audio_path: " bgm/night.mp3 ",
  tags: "夜、静か,  ,ピアノ\n雨",
  is_active: "false" as unknown as boolean,
  sort_order: "3" as unknown as number,
});
assert.equal(full.slug, "calm");
assert.equal(full.title, "静かな夜");
assert.equal(full.loopable, true);
assert.equal(full.audioPath, "bgm/night.mp3");
assert.deepEqual(full.tags, ["夜", "静か", "ピアノ", "雨"]);
assert.equal(full.isActive, false);
assert.equal(full.sortOrder, 3);
assert.deepEqual(mapBgmLibraryRow({ id: "x", tags: [" a ", 1, ""] }).tags, ["a", "1"]);
assert.equal(mapBgmLibraryRow({ id: "x", is_active: null }).isActive, true);
assert.equal(mapBgmLibraryRow({ id: "x", sort_order: "abc" as unknown as number }).sortOrder, 0);

const tracks = [
  mapBgmLibraryRow({ id: "a", title: "朝", audio_path: "bgm/a.mp3" }),
  mapBgmLibraryRow({ id: "b", title: "夜", audio_path: "bgm/b.mp3" }),
];
assert.equal(findBgmLibraryTrack(tracks, "b")?.title, "夜");
assert.equal(findBgmLibraryTrack(tracks, "z"), null);
assert.equal(resolveBgmLibraryTrackId(tracks, { id: " a " }), "a");
assert.equal(resolveBgmLibraryTrackId(tracks, { id: "missing", audioPath: " bgm/b.mp3 " }), "b");
assert.equal(resolveBgmLibraryTrackId(tracks, { title: " 夜 " }), "b");
assert.equal(resolveBgmLibraryTrackId(tracks, { id: "a", audioPath: "bgm/b.mp3" }), "a");
assert.equal(resolveBgmLibraryTrackId(tracks, { id: null, title: "昼" }), "");

async function main() {
  const originalError = console.error;
  console.error = () => {};
  try {
    const active = createSupabaseMock({ data: [{ id: "a", title: "朝" }], error: null });
    assert.deepEqual((await fetchBgmLibraryTracks(active.client)).map((track) => track.id), ["a"]);
    assert.deepEqual(active.queries, [
      {
        table: "bgm_library",
        calls: [
          ["select", "*"],
          ["eq", "is_active", true],
          ["order", "sort_order", { ascending: true }],
          ["order", "title", { ascending: true }],
        ],
      },
    ]);

    const all = createSupabaseMock({ data: null, error: null });
    assert.deepEqual(await fetchAllBgmLibraryTracks(all.client), []);
    assert.deepEqual(all.queries[0]?.calls.map((call) => call[0]), ["select", "order", "order"]);

    // Errors are logged and swallowed (empty list).
    assert.deepEqual(await fetchBgmLibraryTracks(createSupabaseMock({ data: null, error: { message: "x" } }).client), []);
    assert.deepEqual(await fetchAllBgmLibraryTracks(createSupabaseMock({ data: null, error: { message: "x" } }).client), []);

    const favorites = createSupabaseMock({
      data: [{ bgm_library_id: " a " }, { bgm_library_id: "a" }, { bgm_library_id: "" }, { bgm_library_id: null }, { bgm_library_id: "b" }],
      error: null,
    });
    assert.deepEqual(await fetchBgmLibraryFavoriteIds(favorites.client, "user-1"), ["a", "b"]);
    assert.deepEqual(favorites.queries[0], {
      table: "bgm_library_favorites",
      calls: [
        ["select", "bgm_library_id"],
        ["eq", "user_id", "user-1"],
      ],
    });
    const blank = createSupabaseMock({ data: [], error: null });
    assert.deepEqual(await fetchBgmLibraryFavoriteIds(blank.client, "  "), []);
    assert.equal(blank.queries.length, 0);
    assert.deepEqual(
      await fetchBgmLibraryFavoriteIds(createSupabaseMock({ data: null, error: { message: "x" } }).client, "u"),
      []
    );
  } finally {
    console.error = originalError;
  }

  console.log("PASS: BGM library (row mapping, track lookup, fetch queries, error fallbacks)");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
