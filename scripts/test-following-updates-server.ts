import assert from "node:assert/strict";
import Module from "node:module";

// Characterization test: pins current behavior only (LT-002).
// Supabase clients, next/headers, the catalog cache, R18 preference, region map and
// runFollowingUpdates are replaced in-process; no DB access. Synthetic ids only.

type Result = { data: unknown; error: { message: string; code?: string } | null };
type Captured = Record<string, unknown> & {
  readViewerRows: () => Promise<unknown>;
  loadWorks: () => Promise<unknown>;
  loadShowR18: () => Promise<boolean>;
  loadRegionMap: () => Promise<unknown>;
  loadEpisodesForSeries: (args: { seriesId: string; sinceIso: string; nowIso: string; limit: number }) => Promise<unknown>;
};

const state = {
  captured: null as Captured | null,
  sessionResults: {} as Record<string, Result>,
  sessionCalls: [] as unknown[][],
  episodeResults: [] as Result[],
  adminCalls: [] as unknown[][],
  workArgs: [] as unknown[],
  socialCalls: [] as unknown[][],
  socialResult: { signedIn: true, userId: "user-1", targets: [] } as unknown,
};

function recordingBuilder(calls: unknown[], result: () => Result) {
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "gte", "lte", "order", "limit"]) {
    builder[method] = (...args: unknown[]) => (calls.push([method, ...args]), builder);
  }
  builder.then = (resolve: (value: Result) => unknown, reject: (error: unknown) => unknown) =>
    Promise.resolve(result()).then(resolve, reject);
  return builder;
}

const session = {
  from(table: string) {
    const calls: unknown[] = [table];
    state.sessionCalls.push(calls);
    return recordingBuilder(calls, () => state.sessionResults[table] ?? { data: [], error: null });
  },
};
const admin = {
  from(table: string) {
    const calls: unknown[] = [table];
    state.adminCalls.push(calls);
    return recordingBuilder(calls, () => state.episodeResults.shift() ?? { data: [], error: null });
  },
};

const moduleWithLoad = Module as unknown as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown;
};
const originalLoad = moduleWithLoad._load;
const is = (request: string, name: string) => request === `@/lib/${name}` || request.endsWith(`/lib/${name}`);
moduleWithLoad._load = function (request, parent, isMain) {
  if (request === "server-only") return {};
  if (request === "next/headers") return { headers: async () => new Headers({ "x-vercel-ip-country": "jp" }) };
  if (is(request, "supabase/admin")) return { createAdminClient: () => admin };
  if (is(request, "publicWorks")) {
    return { getCachedPublicBaseWorkCards: async (args: unknown) => (state.workArgs.push(args), ["work"]) };
  }
  if (is(request, "social/viewerSocialRows.server")) {
    return {
      readViewerSocialTargets: async (args: { supabase: unknown; kind: string }) => {
        state.socialCalls.push([args.supabase === session, args.kind]);
        const next = state.socialResult;
        if (next instanceof Error) throw next;
        return next;
      },
    };
  }
  if (is(request, "contentRatingServer")) {
    return { getCurrentR18ViewerPreference: async () => ({ showR18Content: true }) };
  }
  if (is(request, "rights/regionRestriction.server")) {
    return {
      countryFromHeaders: (source: Headers) => `country:${source.get("x-vercel-ip-country")}`,
      loadRegionRestrictionMap: async () => "region-map",
    };
  }
  if (is(request, "updates/followingUpdates")) {
    return {
      runFollowingUpdates: async (args: Captured) => {
        state.captured = args;
        return { items: [] };
      },
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

async function main() {
  try {
    const { loadFollowingUpdates } = await import("../src/lib/updates/followingUpdates.server");
    type Session = Parameters<typeof loadFollowingUpdates>[0]["supabase"];

    const now = new Date("2026-11-20T00:00:00Z");
    assert.deepEqual(await loadFollowingUpdates({ supabase: session as unknown as Session, userId: "user-1", now }), {
      items: [],
    });
    const captured = state.captured!;
    assert.equal(captured.userId, "user-1");
    assert.equal(captured.nowValue, now.getTime());
    assert.equal(captured.country, "country:jp");

    // Catalog: viewer visibility, no language filters.
    assert.deepEqual(await captured.loadWorks(), ["work"]);
    assert.deepEqual(state.workArgs, [
      {
        visibility: "viewer",
        ignoreContentLanguageFilter: true,
        ignorePublicSearchLanguageFilter: true,
        prioritizeForUiLocale: false,
      },
    ]);
    assert.equal(await captured.loadShowR18(), true);
    assert.equal(await captured.loadRegionMap(), "region-map");

    // Viewer rows: bookmarks and play_logs with the session filtered by the
    // user id; followed authors through viewerSocialRows (KD-2: author_follows
    // has RLS with no policies, so the session read was always empty).
    state.sessionResults = {
      user_series_bookmarks: { data: [{ user_id: "user-1", series_id: "s-1" }], error: null },
      play_logs: { data: [{ user_id: "user-1", series_id: "s-1", episode_number: 1 }], error: null },
    };
    state.socialResult = {
      signedIn: true,
      userId: "user-1",
      targets: [{ targetId: "author-9", createdAt: "2026-11-01T00:00:00Z" }],
    };
    assert.deepEqual(await captured.readViewerRows(), {
      bookmarks: [{ user_id: "user-1", series_id: "s-1" }],
      follows: [{ follower_user_id: "user-1", followed_author_id: "author-9" }],
      playLogs: [{ user_id: "user-1", series_id: "s-1", episode_number: 1 }],
    });
    assert.deepEqual(state.sessionCalls, [
      ["user_series_bookmarks", ["select", "user_id, series_id"], ["eq", "user_id", "user-1"]],
      ["play_logs", ["select", "user_id, series_id, episode_number"], ["eq", "user_id", "user-1"]],
    ]);
    assert.deepEqual(state.socialCalls, [[true, "followed-authors"]]);

    // A play_logs failure gives null markers; bookmark / follow failures throw.
    state.sessionResults.play_logs = { data: null, error: { message: "denied" } };
    assert.equal(((await captured.readViewerRows()) as { playLogs: unknown }).playLogs, null);
    // The verified viewer must be the user the list is built for.
    state.socialResult = { signedIn: true, userId: "someone-else", targets: [{ targetId: "a", createdAt: "" }] };
    await assert.rejects(captured.readViewerRows(), /^Error: author follows: viewer mismatch$/);
    state.socialResult = { signedIn: false, userId: null, targets: [] };
    await assert.rejects(captured.readViewerRows(), /^Error: author follows: viewer mismatch$/);
    state.socialResult = new Error("nope");
    await assert.rejects(captured.readViewerRows(), /^Error: author follows: nope$/);
    state.sessionResults.user_series_bookmarks = { data: null, error: { message: "down" } };
    await assert.rejects(captured.readViewerRows(), /^Error: bookmarks: down$/);

    // Episodes: public series join, posted + published, time window, newest first.
    const args = { seriesId: "s-1", sinceIso: "2026-11-01T00:00:00Z", nowIso: "2026-11-20T00:00:00Z", limit: 5 };
    state.episodeResults = [
      {
        data: [
          { series_id: " s-1 ", episode_number: "3.7", title: " 第三話 ", posted_at: "2026-11-10T00:00:00Z", series: [{ publication_status: " public " }] },
          { series_id: "s-1", episode_number: 2, title: null, posted_at: "bad", series: { publication_status: "" } },
          { series_id: "s-1", episode_number: 1, posted_at: null, series: null },
          { series_id: "", episode_number: 4 },
          { series_id: "s-1", episode_number: "x" },
        ],
        error: null,
      },
    ];
    assert.deepEqual(await captured.loadEpisodesForSeries(args), [
      { seriesId: "s-1", episodeNumber: 3, title: "第三話", postedAtValue: Date.parse("2026-11-10T00:00:00Z"), seriesPublicationStatus: "public" },
      { seriesId: "s-1", episodeNumber: 2, title: "", postedAtValue: 0, seriesPublicationStatus: null },
      { seriesId: "s-1", episodeNumber: 1, title: "", postedAtValue: 0, seriesPublicationStatus: null },
    ]);
    assert.deepEqual(state.adminCalls, [
      [
        "episodes",
        ["select", "series_id, episode_number, title, posted_at, series!inner(publication_status)"],
        ["eq", "series_id", "s-1"],
        ["eq", "series.publication_status", "public"],
        ["eq", "posting_status", "posted"],
        ["eq", "is_published", true],
        ["gte", "posted_at", args.sinceIso],
        ["lte", "posted_at", args.nowIso],
        ["order", "posted_at", { ascending: false }],
        ["limit", 5],
      ],
    ]);

    // Missing title column: retried once without title.
    state.adminCalls = [];
    state.episodeResults = [
      { data: null, error: { message: "column episodes.title does not exist", code: "42703" } },
      { data: [{ series_id: "s-1", episode_number: 1, posted_at: "2026-11-02T00:00:00Z", series: { publication_status: "public" } }], error: null },
    ];
    const retried = (await captured.loadEpisodesForSeries(args)) as Array<{ title: string }>;
    assert.equal(retried.length, 1);
    assert.equal(retried[0].title, "");
    assert.equal(state.adminCalls.length, 2);
    assert.deepEqual(state.adminCalls[1][1], ["select", "series_id, episode_number, posted_at, series!inner(publication_status)"]);

    // Other errors (and a failed retry) throw.
    state.episodeResults = [{ data: null, error: { message: "timeout" } }];
    await assert.rejects(captured.loadEpisodesForSeries(args), /^Error: episodes: timeout$/);
    state.episodeResults = [
      { data: null, error: { message: "x", code: "PGRST204" } },
      { data: null, error: { message: "still broken" } },
    ];
    await assert.rejects(captured.loadEpisodesForSeries(args), /^Error: episodes: still broken$/);

    console.log("followingUpdates.server characterization: PASS");
  } finally {
    moduleWithLoad._load = originalLoad;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
