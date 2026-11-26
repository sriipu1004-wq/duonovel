import assert from "node:assert/strict";
import Module from "node:module";

// Characterization test: pins current behavior only (LT-002).
// Supabase clients are replaced in-process; no DB or Auth access. Synthetic ids only.

type Row = Record<string, unknown> | null;
const state = {
  viewer: null as { id: string } | null,
  viewerPreference: null as Row,
  series: null as Row,
  episode: null as Row,
  seriesError: null as { message: string } | null,
  episodeError: null as { message: string } | null,
};

function readBuilder(result: () => { data: Row; error: { message: string } | null }) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    maybeSingle: async () => result(),
  };
  return builder;
}

// Used both as the injected admin client and for the R18 viewer preference read.
const admin = {
  from(table: string) {
    if (table === "series") return readBuilder(() => ({ data: state.series, error: state.seriesError }));
    if (table === "episodes") return readBuilder(() => ({ data: state.episode, error: state.episodeError }));
    if (table === "users") return readBuilder(() => ({ data: state.viewerPreference, error: null }));
    throw new Error(`unexpected table ${table}`);
  },
};

const moduleWithLoad = Module as unknown as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown;
};
const originalLoad = moduleWithLoad._load;
moduleWithLoad._load = function (request, parent, isMain) {
  if (request === "server-only") return {};
  if (request === "@/lib/supabase/admin" || request.endsWith("/lib/supabase/admin")) return { createAdminClient: () => admin };
  if (request === "@/lib/supabase/server" || request.endsWith("/lib/supabase/server")) {
    return { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: state.viewer }, error: null }) } }) };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const SERIES = "series-1";
const EPISODE = "episode-1";

async function main() {
  try {
    const { loadPrivateMediaSourceContext } = await import("../src/lib/recording/privateMediaSourceAccess");
    type Admin = Parameters<typeof loadPrivateMediaSourceContext>[0];
    const load = () => loadPrivateMediaSourceContext(admin as unknown as Admin, SERIES, EPISODE);

    // Public, posted, general work; anonymous viewer.
    state.series = { id: SERIES, author_id: "author-1", publication_status: "public", content_rating: "general" };
    state.episode = { id: EPISODE, series_id: SERIES, posting_status: "posted", is_published: true };
    const anonymous = await load();
    assert.equal(anonymous?.viewerUserId, null);
    assert.deepEqual(anonymous?.snapshot, {
      seriesPublic: true,
      episodePublic: true,
      episodeBelongsToSeries: true,
      viewerIsSeriesOwner: false,
      isR18: false,
      viewerShowsR18: false,
    });
    assert.equal(anonymous?.series, state.series);

    // Owner of a private draft, R18 work, opted in with age confirmation.
    state.series = { id: SERIES, user_id: "author-1", publication_status: "private", content_rating: "r18" };
    state.episode = { id: EPISODE, seriesId: SERIES, posting_status: "draft", is_published: false };
    state.viewer = { id: "author-1" };
    state.viewerPreference = { show_r18_content: true, r18_confirmed_at: "2026-01-01T00:00:00Z" };
    const owner = await load();
    assert.equal(owner?.viewerUserId, "author-1");
    assert.deepEqual(owner?.snapshot, {
      seriesPublic: false,
      episodePublic: false,
      episodeBelongsToSeries: true,
      viewerIsSeriesOwner: true,
      isR18: true,
      viewerShowsR18: true,
    });

    // Another signed-in viewer; scheduled episode; episode from another series.
    state.viewer = { id: "reader-2" };
    state.viewerPreference = { show_r18_content: true, r18_confirmed_at: null };
    state.episode = { id: EPISODE, series_id: "series-other", posting_status: "scheduled", is_published: true };
    const other = await load();
    assert.equal(other?.snapshot.viewerIsSeriesOwner, false);
    assert.equal(other?.snapshot.episodeBelongsToSeries, false);
    assert.equal(other?.snapshot.episodePublic, false);
    assert.equal(other?.snapshot.viewerShowsR18, false, "opt-in without age confirmation does not count");

    // Series row id must match the requested id.
    state.series = { id: "series-x", author_id: "author-1", publication_status: "public" };
    state.episode = { id: EPISODE, series_id: SERIES, posting_status: "posted", is_published: true };
    assert.equal((await load())?.snapshot.episodeBelongsToSeries, false);

    // Any failed or missing read -> null (callers answer 404).
    state.series = { id: SERIES, publication_status: "public" };
    state.seriesError = { message: "x" };
    assert.equal(await load(), null);
    state.seriesError = null;
    state.episodeError = { message: "x" };
    assert.equal(await load(), null);
    state.episodeError = null;
    state.episode = null;
    assert.equal(await load(), null);
    state.episode = { id: EPISODE, series_id: SERIES };
    state.series = null;
    assert.equal(await load(), null);
  } finally {
    moduleWithLoad._load = originalLoad;
  }

  console.log("PASS: private media source context (publication, ownership, series binding, R18 viewer, failed reads)");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
