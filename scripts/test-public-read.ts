import assert from "node:assert/strict";
import Module from "node:module";

// Characterization test: pins current behavior only (LT-002).
// react's cache, the Supabase server/admin clients and the R18 preference reader are replaced
// in-process; no DB or Auth access. Synthetic ids only.

type Row = Record<string, unknown>;
type Result = { data: unknown; error: { message: string; code?: string } | null };
const ok = (data: unknown): Result => ({ data, error: null });
const state = {
  series: ok(null) as Result,
  current: ok(null) as Result,
  previous: [] as Result[],
  next: ok(null) as Result,
  recordings: [] as Result[],
  consents: ok([]) as Result,
  user: null as { id: string; email?: string } | null,
  authErrors: [] as unknown[],
  r18: null as null | (() => Promise<Row>),
  log: [] as unknown[][],
  authCalls: 0,
};

function query(table: string) {
  const calls: unknown[] = [table];
  state.log.push(calls);
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "in", "lt", "gt", "order", "limit", "abortSignal"]) {
    builder[method] = (...args: unknown[]) => (calls.push([method, ...args]), builder);
  }
  const has = (method: string) => calls.some((c) => Array.isArray(c) && c[0] === method);
  const pick = (): Result => {
    if (table === "series") return state.series;
    if (table === "recordings") return state.recordings.shift() ?? ok([]);
    if (table === "user_recording_consents") return state.consents;
    if (has("lt")) return state.previous.shift() ?? ok(null);
    if (has("gt")) return state.next;
    return state.current;
  };
  builder.maybeSingle = async () => pick();
  builder.then = (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) =>
    Promise.resolve(pick()).then(resolve, reject);
  return builder;
}

const sessionClient = {
  auth: {
    getUser: async () => {
      state.authCalls += 1;
      const error = state.authErrors.shift() ?? null;
      return { data: { user: error ? null : state.user }, error };
    },
  },
};

const moduleWithLoad = Module as unknown as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown;
};
const originalLoad = moduleWithLoad._load;
const is = (request: string, name: string) => request === `@/lib/${name}` || request.endsWith(`/lib/${name}`);
moduleWithLoad._load = function (request, parent, isMain) {
  if (request === "react") return { cache: <T,>(fn: T) => fn };
  if (is(request, "supabase/admin")) return { createAdminClient: () => ({ from: query }) };
  if (is(request, "supabase/server")) return { createClient: async () => sessionClient };
  if (is(request, "contentRatingServer")) {
    return { getCurrentR18ViewerPreference: async () => (state.r18 ? state.r18() : { showR18Content: false }) };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const SERIES = { id: "s-1", author_id: "author-1", publication_status: "public", content_rating: "general" };
const EP = { id: "ep-1", series_id: "s-1", episode_number: 2, posting_status: "posted", is_published: true };
const HUMAN = { id: "r-1", episode_id: "ep-1", reader_id: "n-1", reader_name: "読み手", audio_storage_path: "human/s-1/ep-1/a.webm", voice_model_id: null, is_public: true };

function reset() {
  state.series = ok(SERIES);
  state.current = ok(EP);
  state.previous = [ok({ id: "ep-0", episode_number: 1 })];
  state.next = ok(null);
  state.recordings = [];
  state.consents = ok([]);
  state.user = null;
  state.authErrors = [];
  state.r18 = null;
  state.log = [];
  state.authCalls = 0;
}

async function main() {
  const savedWarn = console.warn;
  console.warn = () => {};
  try {
    const { getCachedPublicReadPagePayload: load } = await import("../src/lib/publicRead");
    const projection = await import("../src/lib/recording/readerEpisodeRecordingProjection");
    const { RECORDING_GLOBAL_CONSENT_KEY, ACCEPTED_RECORDING_PLAYBACK_CONSENT_VERSIONS } = await import("../src/lib/recording/recordingConsent");
    const byTable = (table: string) => state.log.filter((calls) => calls[0] === table);
    const strip = (calls: unknown[]) => calls.filter((c) => !(Array.isArray(c) && c[0] === "abortSignal"));

    // Public work, anonymous viewer.
    reset();
    const anon = await load("s-1", 2);
    assert.deepEqual(anon, {
      series: SERIES,
      episode: EP,
      previousEpisode: { id: "ep-0", episode_number: 1 },
      nextEpisode: null,
      allEpisodeRecordings: [],
      isOwner: false,
      r18Blocked: false,
      viewerSignedIn: false,
      viewerUserId: null,
      viewerEmail: null,
    });
    const episodes = byTable("episodes").map(strip);
    const current = episodes.find((c) => !c.some((x) => Array.isArray(x) && (x[0] === "lt" || x[0] === "gt")))!;
    assert.deepEqual(current, ["episodes", ["select", "*"], ["eq", "series_id", "s-1"], ["eq", "episode_number", 2], ["eq", "posting_status", "posted"], ["eq", "is_published", true]]);
    const previous = episodes.find((c) => c.some((x) => Array.isArray(x) && x[0] === "lt"))!;
    assert.deepEqual(previous.slice(2), [
      ["eq", "series_id", "s-1"],
      ["eq", "posting_status", "posted"],
      ["eq", "is_published", true],
      ["lt", "episode_number", 2],
      ["order", "episode_number", { ascending: false }],
      ["order", "id", { ascending: false }],
      ["limit", 1],
    ]);
    const next = episodes.find((c) => c.some((x) => Array.isArray(x) && x[0] === "gt"))!;
    assert.deepEqual(next.slice(-4), [["gt", "episode_number", 2], ["order", "episode_number", { ascending: true }], ["order", "id", { ascending: true }], ["limit", 1]]);
    assert.deepEqual(strip(byTable("recordings")[0]).slice(1, 4), [["select", (strip(byTable("recordings")[0])[1] as unknown[])[1]], ["eq", "episode_id", "ep-1"], ["order", "created_at", { ascending: false }]]);

    // Missing / errored series.
    reset();
    state.series = ok(null);
    assert.equal(await load("s-1", 2), null);
    reset();
    state.series = { data: null, error: { message: "down" } };
    await assert.rejects(load("s-1", 2), /reader series failed: down/);

    // Private work: only the owner (author_id / user_id); owner reads drafts without the posted filter.
    reset();
    state.series = ok({ ...SERIES, publication_status: "private" });
    state.user = { id: "someone" };
    assert.equal(await load("s-1", 2), null);
    reset();
    state.series = ok({ id: "s-1", user_id: "author-1", publication_status: "private" });
    state.user = { id: "author-1", email: "a@example.test" };
    state.current = ok({ ...EP, posting_status: "draft", is_published: false });
    const owner = await load("s-1", 2);
    assert.equal(owner!.isOwner, true);
    assert.equal(owner!.viewerEmail, "a@example.test");
    const ownerCurrent = strip(byTable("episodes").find((c) => !c.some((x) => Array.isArray(x) && (x[0] === "lt" || x[0] === "gt")))!);
    assert.equal(ownerCurrent.some((x) => Array.isArray(x) && x[1] === "posting_status"), false);

    // Private work: after a failed first auth read, a second read with one retry (transient errors only).
    reset();
    state.series = ok({ ...SERIES, publication_status: "private" });
    state.user = { id: "author-1" };
    state.authErrors = [new Error("fetch failed"), new Error("fetch failed"), null];
    const retried = await load("s-1", 2);
    assert.equal(retried!.isOwner, true);
    assert.equal(state.authCalls, 3);
    // A non-transient auth error is not retried inside the second read (2 reads in all).
    reset();
    state.series = ok({ ...SERIES, publication_status: "private" });
    state.user = { id: "author-1" };
    state.authErrors = [new Error("network"), new Error("network"), null];
    assert.equal(await load("s-1", 2), null);
    assert.equal(state.authCalls, 2);
    // A missing session is not an auth failure (no second read).
    reset();
    state.series = ok({ ...SERIES, publication_status: "private" });
    state.authErrors = [new Error("Auth session missing!")];
    assert.equal(await load("s-1", 2), null);
    assert.equal(state.authCalls, 1);
    // On a public work an auth failure is just "signed out".
    reset();
    state.authErrors = [new Error("network")];
    state.user = { id: "u" };
    const signedOut = await load("s-1", 2);
    assert.equal(signedOut!.viewerSignedIn, false);
    assert.equal(state.authCalls, 1);

    // Episode missing, or not public for a non-owner (row returned anyway).
    reset();
    state.current = ok(null);
    assert.equal(await load("s-1", 2), null);
    reset();
    state.current = ok({ ...EP, posting_status: "scheduled" });
    assert.equal(await load("s-1", 2), null);
    reset();
    state.current = { data: null, error: { message: "boom" } };
    await assert.rejects(load("s-1", 2), /reader episode failed: boom/);

    // Adjacent episode: narrow select falls back to * on a schema error; other errors throw.
    reset();
    state.previous = [{ data: null, error: { message: "column x does not exist", code: "42703" } }, ok({ id: "ep-0" })];
    assert.deepEqual((await load("s-1", 2))!.previousEpisode, { id: "ep-0" });
    const prevSelects = byTable("episodes").filter((c) => c.some((x) => Array.isArray(x) && x[0] === "lt")).map((c) => (c[1] as unknown[])[1]);
    assert.equal(prevSelects.length, 2);
    assert.equal(prevSelects[1], "*");
    reset();
    state.previous = [{ data: null, error: { message: "denied" } }, { data: null, error: { message: "denied" } }, { data: null, error: { message: "denied" } }];
    await assert.rejects(load("s-1", 2), /reader previous episode failed: denied/);

    // R18: blocked for anonymous viewers and for viewers who did not opt in; recordings hidden.
    reset();
    state.series = ok({ ...SERIES, content_rating: "r18" });
    state.recordings = [ok([HUMAN])];
    const r18Anon = await load("s-1", 2);
    assert.equal(r18Anon!.r18Blocked, true);
    assert.deepEqual(r18Anon!.allEpisodeRecordings, []);
    assert.deepEqual(byTable("recordings"), []);
    reset();
    state.series = ok({ ...SERIES, content_rating: "r18" });
    state.user = { id: "u" };
    state.r18 = async () => ({ showR18Content: true });
    assert.equal((await load("s-1", 2))!.r18Blocked, false);
    reset();
    state.series = ok({ ...SERIES, content_rating: "r18" });
    state.user = { id: "u" };
    state.r18 = async () => {
      throw new Error("pref down");
    };
    assert.equal((await load("s-1", 2))!.r18Blocked, true);

    // Recordings: human rows only with an accepted narrator consent.
    assert.deepEqual(projection.listPublishedHumanNarratorIds([HUMAN]), ["n-1"]);
    const consented = projection.projectReaderEpisodeRecordings([HUMAN], "ep-1", new Set(["n-1"]));
    assert.equal(consented.length, 1);
    reset();
    state.recordings = [ok([HUMAN])];
    state.consents = ok([{ user_id: "n-1", consent_version: ACCEPTED_RECORDING_PLAYBACK_CONSENT_VERSIONS[0] }]);
    assert.deepEqual((await load("s-1", 2))!.allEpisodeRecordings, consented);
    assert.deepEqual(strip(byTable("user_recording_consents")[0]), [
      "user_recording_consents",
      ["select", "user_id, consent_version"],
      ["in", "user_id", ["n-1"]],
      ["eq", "consent_key", RECORDING_GLOBAL_CONSENT_KEY],
    ]);
    for (const consents of [ok([{ user_id: "n-1", consent_version: "old" }]), { data: null, error: { message: "x" } }]) {
      reset();
      state.recordings = [ok([HUMAN])];
      state.consents = consents as Result;
      assert.deepEqual((await load("s-1", 2))!.allEpisodeRecordings, []);
    }
    // Recordings: schema error -> retried with *; other errors -> empty list.
    reset();
    state.recordings = [{ data: null, error: { message: "x", code: "PGRST204" } }, ok([HUMAN])];
    state.consents = ok([{ user_id: "n-1", consent_version: ACCEPTED_RECORDING_PLAYBACK_CONSENT_VERSIONS[0] }]);
    assert.equal((await load("s-1", 2))!.allEpisodeRecordings.length, 1);
    assert.equal((byTable("recordings")[1][1] as unknown[])[1], "*");
    reset();
    state.recordings = [{ data: null, error: { message: "down" } }];
    assert.deepEqual((await load("s-1", 2))!.allEpisodeRecordings, []);

    console.log("publicRead characterization: PASS");
  } finally {
    moduleWithLoad._load = originalLoad;
    console.warn = savedWarn;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
