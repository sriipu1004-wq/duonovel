import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import Module from "node:module";
import { join } from "node:path";

// Issue #216 (KD-4): service-role reads for per-country restricted works must
// apply the same select RLS as the session/anon reads they replace, and every
// recording API must check the visitor's country first. The admin client and
// the region map are replaced in-process; no DB access.

type Row = Record<string, unknown>;
type Filter = { op: "eq" | "in" | "is"; column: string; value: unknown };
type Call = { table: string; select: string; filters: Filter[] };

const db: Record<string, Row[]> = { series: [], episodes: [], recordings: [] };
const calls: Call[] = [];
const regionState: { map: Map<string, unknown>; fail: boolean } = { map: new Map(), fail: false };
const state = { publicReadClients: 0, failTable: null as string | null };

function matches(row: Row, filter: Filter): boolean {
  const value = row[filter.column];
  if (filter.op === "eq") return value === filter.value;
  if (filter.op === "is") return value === null || value === undefined;
  return (filter.value as unknown[]).includes(value);
}

function builder(table: string) {
  const call: Call = { table, select: "", filters: [] };
  calls.push(call);
  let range: [number, number] | null = null;
  const run = () => {
    let rows = (db[table] ?? []).filter((row) => call.filters.every((f) => matches(row, f)));
    if (range) rows = rows.slice(range[0], range[1] + 1);
    return rows;
  };
  const api = {
    select(columns: string) {
      call.select = columns;
      return api;
    },
    eq(column: string, value: unknown) {
      call.filters.push({ op: "eq", column, value });
      return api;
    },
    in(column: string, value: unknown[]) {
      call.filters.push({ op: "in", column, value });
      return api;
    },
    is(column: string, value: null) {
      call.filters.push({ op: "is", column, value });
      return api;
    },
    order() {
      return api;
    },
    range(from: number, to: number) {
      range = [from, to];
      return api;
    },
    maybeSingle() {
      const rows = run();
      return Promise.resolve({ data: rows[0] ?? null, error: null });
    },
    then(resolve: (value: { data: Row[] | null; error: { message: string } | null }) => unknown, reject?: (e: unknown) => unknown) {
      if (state.failTable === table) {
        return Promise.resolve({ data: null, error: { message: "timeout" } }).then(resolve, reject);
      }
      return Promise.resolve({ data: run(), error: null }).then(resolve, reject);
    },
  };
  return api;
}

const adminClient = { from: (table: string) => builder(table) };

const moduleWithLoad = Module as unknown as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown;
};
const originalLoad = moduleWithLoad._load;
moduleWithLoad._load = function (request, parent, isMain) {
  if (request === "server-only") return {};
  if (request === "@/lib/supabase/admin" || request.endsWith("/lib/supabase/admin")) {
    return {
      createAdminClient: () => adminClient,
      createAdminPublicReadClient: () => {
        state.publicReadClients += 1;
        return adminClient;
      },
    };
  }
  if (request === "@/lib/rights/regionRestriction.server" || request.endsWith("/rights/regionRestriction.server")) {
    return {
      loadRegionRestrictionMap: async () => {
        if (regionState.fail) throw new Error("region list unavailable");
        return regionState.map;
      },
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const AUTHOR = "aaaaaaaa-0000-4000-8000-000000000001";
const READER = "aaaaaaaa-0000-4000-8000-000000000002";
const RESTRICTED = "bbbbbbbb-0000-4000-8000-000000000001";
const PRIVATE_RESTRICTED = "bbbbbbbb-0000-4000-8000-000000000002";
const FREE = "bbbbbbbb-0000-4000-8000-000000000003";
const OTHER_RESTRICTED = "bbbbbbbb-0000-4000-8000-000000000004";

function seed() {
  db.series = [
    { id: RESTRICTED, author_id: AUTHOR, publication_status: "public", recording_permission_mode: "open" },
    { id: PRIVATE_RESTRICTED, author_id: AUTHOR, publication_status: "private", recording_permission_mode: "open" },
    { id: FREE, author_id: AUTHOR, publication_status: "public", recording_permission_mode: "open" },
    { id: OTHER_RESTRICTED, author_id: AUTHOR, publication_status: "public", recording_permission_mode: "open" },
  ];
  db.episodes = [
    { id: "ep-posted", series_id: RESTRICTED, episode_number: 1, posting_status: "posted", is_published: true },
    { id: "ep-draft", series_id: RESTRICTED, episode_number: 2, posting_status: "draft", is_published: false },
    { id: "ep-unpublished", series_id: RESTRICTED, episode_number: 3, posting_status: "posted", is_published: false },
    { id: "ep-private", series_id: PRIVATE_RESTRICTED, episode_number: 1, posting_status: "posted", is_published: true },
    { id: "ep-free", series_id: FREE, episode_number: 1, posting_status: "posted", is_published: true },
    { id: "ep-other", series_id: OTHER_RESTRICTED, episode_number: 1, posting_status: "posted", is_published: true },
  ];
  db.recordings = [
    { id: "r-ok", series_id: RESTRICTED, episode_id: "ep-posted", is_public: true, voice_model_id: null },
    { id: "r-private", series_id: RESTRICTED, episode_id: "ep-posted", is_public: false, voice_model_id: null },
    { id: "r-draft-ep", series_id: RESTRICTED, episode_id: "ep-draft", is_public: true, voice_model_id: null },
    { id: "r-unpub-ep", series_id: RESTRICTED, episode_id: "ep-unpublished", is_public: true, voice_model_id: null },
    { id: "r-ai", series_id: RESTRICTED, episode_id: "ep-posted", is_public: true, voice_model_id: "vm-1" },
    { id: "r-private-series", series_id: PRIVATE_RESTRICTED, episode_id: "ep-private", is_public: true, voice_model_id: null },
    { id: "r-cross", series_id: RESTRICTED, episode_id: "ep-other", is_public: true, voice_model_id: null },
    { id: "r-free", series_id: FREE, episode_id: "ep-free", is_public: true, voice_model_id: null },
    { id: "r-other", series_id: OTHER_RESTRICTED, episode_id: "ep-other", is_public: true, voice_model_id: null },
  ];
  regionState.map = new Map([
    [RESTRICTED, { mode: "block", countries: ["US"] }],
    [PRIVATE_RESTRICTED, { mode: "block", countries: ["US"] }],
    [OTHER_RESTRICTED, { mode: "allow", countries: ["JP"] }],
  ]);
  regionState.fail = false;
}

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

async function main() {
  seed();
  const vis = await import("../src/lib/rights/rlsVisibility");
  const target = await import("../src/lib/recording/recordingTargetAccess.server");
  const reads = await import("../src/lib/rights/restrictedWorkPublicReads.server");

  // --- Pure RLS mirrors -----------------------------------------------------
  const pub = db.series[0];
  const priv = db.series[1];
  const posted = db.episodes[0];
  const draft = db.episodes[1];
  assert.equal(vis.canViewerSeeSeries(pub, READER), true);
  assert.equal(vis.canViewerSeeSeries(priv, READER), false, "non-author cannot see a private work");
  assert.equal(vis.canViewerSeeSeries(priv, AUTHOR), true, "author sees own private work");
  assert.equal(vis.canViewerSeeSeries(priv, null), false);
  assert.equal(vis.canViewerSeeEpisode(pub, posted, READER), true);
  assert.equal(vis.canViewerSeeEpisode(pub, draft, READER), false, "non-author cannot see a draft");
  assert.equal(vis.canViewerSeeEpisode(pub, draft, AUTHOR), true, "author sees own draft");
  assert.equal(vis.canViewerSeeEpisode(pub, db.episodes[4], AUTHOR), false, "episode of another series");
  assert.equal(vis.canViewerSeeEpisode(priv, db.episodes[3], READER), false);
  assert.equal(vis.isRecordingPubliclyVisible(db.recordings[0], posted, pub), true);
  assert.equal(vis.isRecordingPubliclyVisible(db.recordings[1], posted, pub), false, "is_public=false");
  assert.equal(vis.isRecordingPubliclyVisible(db.recordings[2], draft, pub), false, "draft episode");
  assert.equal(vis.isRecordingPubliclyVisible(db.recordings[6], db.episodes[5], pub), false, "cross-series episode");
  assert.equal(vis.isRecordingPubliclyVisible({ ...db.recordings[0], is_public: "true" }, posted, pub), false);

  // --- Recording target (API routes) ---------------------------------------
  const admin = adminClient as never;
  calls.length = 0;
  const readerOk = await target.loadRecordingTargetForViewer(admin, {
    seriesId: RESTRICTED,
    episodeId: "ep-posted",
    viewerId: READER,
  });
  assert.equal(readerOk.ok, true, "non-author can target a posted episode of a restricted public work");
  const episodeCall = calls.find((c) => c.table === "episodes")!;
  for (const [column, value] of [
    ["id", "ep-posted"],
    ["series_id", RESTRICTED],
    ["posting_status", "posted"],
    ["is_published", true],
  ] as const) {
    assert.ok(
      episodeCall.filters.some((f) => f.op === "eq" && f.column === column && f.value === value),
      `non-author episode query must filter ${column}`
    );
  }

  for (const episodeId of ["ep-draft", "ep-unpublished", "ep-free", "missing"]) {
    const denied = await target.loadRecordingTargetForViewer(admin, {
      seriesId: RESTRICTED,
      episodeId,
      viewerId: READER,
    });
    assert.deepEqual(denied, { ok: false, reason: "episode_not_accessible" }, episodeId);
  }
  assert.deepEqual(
    await target.loadRecordingTargetForViewer(admin, { seriesId: PRIVATE_RESTRICTED, episodeId: "ep-private", viewerId: READER }),
    { ok: false, reason: "series_not_found" },
    "non-author cannot target a private work"
  );

  calls.length = 0;
  const authorDraft = await target.loadRecordingTargetForViewer(admin, {
    seriesId: RESTRICTED,
    episodeId: "ep-draft",
    viewerId: AUTHOR,
  });
  assert.equal(authorDraft.ok, true, "author keeps access to own draft (RLS author exception)");
  assert.equal(authorDraft.ok && authorDraft.isAuthor, true);
  assert.equal(
    calls.find((c) => c.table === "episodes")!.filters.some((f) => f.column === "posting_status"),
    false
  );
  assert.equal(
    (await target.loadRecordingTargetForViewer(admin, { seriesId: PRIVATE_RESTRICTED, episodeId: "ep-private", viewerId: AUTHOR })).ok,
    true
  );
  assert.deepEqual(
    await target.loadRecordingTargetForViewer(admin, { seriesId: RESTRICTED, episodeId: "ep-posted", viewerId: "" }),
    { ok: false, reason: "episode_not_accessible" }
  );

  // --- Recording studio episode list ---------------------------------------
  const readerList = await target.loadRecordingEpisodesForViewer(admin, { seriesId: RESTRICTED, viewerId: READER });
  assert.deepEqual(readerList.episodes.map((e) => e.id), ["ep-posted"]);
  const authorList = await target.loadRecordingEpisodesForViewer(admin, { seriesId: RESTRICTED, viewerId: AUTHOR });
  assert.deepEqual(authorList.episodes.map((e) => e.id).sort(), ["ep-draft", "ep-posted", "ep-unpublished"]);
  const privateList = await target.loadRecordingEpisodesForViewer(admin, { seriesId: PRIVATE_RESTRICTED, viewerId: READER });
  assert.deepEqual(privateList, { episodes: [], error: null });

  // --- Public catalog supplements (cards, search, ranking) -----------------
  const restrictedRecordings = await reads.fetchRestrictedPublicRecordings(null, "*", { humanOnly: true });
  assert.deepEqual(
    restrictedRecordings.map((r) => r.id).sort(),
    ["r-ok", "r-other"],
    "only public human recordings on posted, published episodes of public restricted works"
  );
  const recordingCall = calls.filter((c) => c.table === "recordings").at(-1)!;
  assert.ok(recordingCall.filters.some((f) => f.op === "eq" && f.column === "is_public" && f.value === true));
  assert.ok(recordingCall.filters.some((f) => f.op === "is" && f.column === "voice_model_id"));
  assert.ok(
    (recordingCall.filters.find((f) => f.op === "in" && f.column === "series_id")!.value as string[]).every(
      (id) => regionState.map.has(id)
    ),
    "service role reads only restricted works"
  );
  assert.ok(
    calls.some((c) => c.table === "series" && c.filters.some((f) => f.column === "publication_status" && f.value === "public"))
  );
  assert.deepEqual(
    (await reads.fetchRestrictedPublicRecordings([RESTRICTED, FREE], "*", { humanOnly: true })).map((r) => r.id),
    ["r-ok"],
    "limited to requested restricted works; unrestricted works stay on the anon path"
  );
  assert.deepEqual(await reads.fetchRestrictedPublicRecordings([FREE], "*"), []);

  const restrictedEpisodes = await reads.fetchRestrictedPublicEpisodes([RESTRICTED, PRIVATE_RESTRICTED, FREE], "*");
  assert.deepEqual(restrictedEpisodes.map((e) => e.id), ["ep-posted"]);

  // Supplements use the service role with the anon read deadline.
  assert.ok(state.publicReadClients > 0, "supplements use createAdminPublicReadClient");
  const adminSource = source("src/lib/supabase/admin.ts");
  const deadlineClient = adminSource.slice(adminSource.indexOf("export function createAdminPublicReadClient"));
  assert.ok(deadlineClient.includes("fetch: publicReadFetch"), "same deadline as the anon catalog client");
  assert.equal(
    source("src/lib/rights/restrictedWorkPublicReads.server.ts").includes("createAdminClient()"),
    false,
    "no supplement read without the deadline"
  );

  // A failed or timed-out supplement read returns no supplement; it never throws.
  for (const table of ["series", "recordings", "episodes"]) {
    state.failTable = table;
    assert.deepEqual(await reads.fetchRestrictedPublicRecordings(null, "*"), [], `recordings supplement, ${table} fails`);
    if (table !== "recordings") {
      assert.deepEqual(await reads.fetchRestrictedPublicEpisodes([RESTRICTED], "*"), [], `episodes supplement, ${table} fails`);
    }
  }
  state.failTable = null;

  regionState.fail = true;
  assert.deepEqual(await reads.fetchRestrictedPublicRecordings(null, "*"), [], "unreadable list leaves restricted works out");
  assert.deepEqual(await reads.listRestrictedSeriesIds(null), []);
  regionState.fail = false;

  // --- Country cases for the fixtures (the API answers 451 when blocked; the
  // 451 response itself is covered by test:region-restriction-server) -------
  const region = await import("../src/lib/rights/regionRestriction");
  const map = regionState.map as Parameters<typeof region.isSeriesBlockedInCountry>[0];
  assert.equal(region.isSeriesBlockedInCountry(map, RESTRICTED, "JP"), false, "allowed country proceeds");
  assert.equal(region.isSeriesBlockedInCountry(map, RESTRICTED, "US"), true, "blocked country is refused");
  assert.equal(region.isSeriesBlockedInCountry(map, RESTRICTED, null), true, "unknown country is refused");
  assert.equal(region.isSeriesBlockedInCountry(map, OTHER_RESTRICTED, "JP"), false, "allow list: listed country");
  assert.equal(region.isSeriesBlockedInCountry(map, OTHER_RESTRICTED, "KR"), true, "allow list: other country");
  assert.equal(region.isSeriesBlockedInCountry(map, FREE, null), false, "unrestricted work is unaffected");

  // --- Every recording API checks the visitor's country first --------------
  for (const route of [
    "src/app/api/recordings/human-upload-session/route.ts",
    "src/app/api/recordings/human-upload-finalize/route.ts",
    "src/app/api/recordings/human-publish/route.ts",
    "src/app/api/recordings/nemo-generate/route.ts",
    "src/app/api/recordings/aivis-generate/route.ts",
  ]) {
    const text = source(route);
    const region = text.indexOf("await regionBlockedApiResponse(request, seriesId)");
    const access = text.indexOf("await loadRecordingTargetForViewer(");
    assert.ok(region > 0, `${route} must check the region`);
    assert.ok(access > region, `${route} must check the region before the service-role read`);
    assert.ok(text.includes("if (regionBlocked) return regionBlocked;"), route);
    assert.ok(text.includes("viewerId: user.id"), `${route} must pass the signed-in user as viewer`);
  }
  for (const route of ["src/app/api/recordings/nemo-generate/route.ts", "src/app/api/recordings/aivis-generate/route.ts"]) {
    assert.ok(source(route).includes("supabase: generationSupabase,"), `${route} generates with the authorized client`);
  }
  const studio = source("src/app/record/create/[seriesId]/page.tsx");
  assert.ok(
    studio.indexOf("assertSeriesAvailableInRequestRegion(seriesId)") <
      studio.indexOf("loadRecordingEpisodesForViewer(adminSupabase"),
    "recording studio checks the region before the service-role read"
  );

  // Public aggregates stay anon-first (#137) and use the service role only via
  // the restricted-work helper.
  const works = source("src/lib/publicWorks.ts");
  const block = works.slice(
    works.indexOf("async function buildPublicRecordingAggregates("),
    works.indexOf("const getCachedPublicRecordingAggregatesInternal")
  );
  assert.ok(block.includes("createPublicServerClient()"));
  assert.equal(block.includes("createAdminClient("), false);
  assert.ok(block.includes("fetchRestrictedRecordingAggregateRows(normalizedSeriesIds)"));
  assert.ok(block.includes("seenRecordingIds"));

  console.log(
    "PASS: #216 restricted works — RLS-equivalent service-role reads (author/non-author, public/private, posted/draft), region check before every recording API read, anon-first public aggregates"
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => {
    moduleWithLoad._load = originalLoad;
  });
