import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import Module from "node:module";
import { normalizeTranslationSourceText, segmentSourceDocument } from "../src/lib/translation/segmentSourceDocument";

// Characterization test: pins current behavior only (LT-002).
// Supabase clients, next/headers, the R18 preference and the region guard are replaced in-process.

type Row = Record<string, unknown> | null;
const state = {
  user: null as Record<string, unknown> | null,
  episode: null as Row,
  series: null as Row,
  showR18: false,
  regionBlocked: false,
  regionChecks: [] as Array<[string, string | null]>,
};

const adminStub = {
  createAdminClient: () => ({
    from(table: string) {
      const builder = {
        select: () => builder,
        eq: () => builder,
        maybeSingle: async () => ({ data: table === "episodes" ? state.episode : state.series, error: null }),
      };
      return builder;
    },
  }),
};

const moduleWithLoad = Module as unknown as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown;
};
const originalLoad = moduleWithLoad._load;
moduleWithLoad._load = function (request, parent, isMain) {
  if (request === "server-only") return {};
  if (request === "@/lib/supabase/admin" || request.endsWith("/lib/supabase/admin")) return adminStub;
  if (request === "@/lib/supabase/server" || request.endsWith("/lib/supabase/server")) {
    return { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: state.user } }) } }) };
  }
  if (request === "next/headers") return { headers: async () => new Headers({ "x-vercel-ip-country": "JP" }) };
  if (request === "@/lib/contentRatingServer" || request.endsWith("/lib/contentRatingServer")) {
    return { getCurrentR18ViewerPreference: async () => ({ showR18Content: state.showR18 }) };
  }
  if (request === "@/lib/rights/regionRestriction.server" || request.endsWith("/lib/rights/regionRestriction.server")) {
    return {
      countryFromHeaders: (headers: Headers) => headers.get("x-vercel-ip-country"),
      isSeriesRegionBlockedForCountry: async (seriesId: string, country: string | null) => {
        state.regionChecks.push([seriesId, country]);
        return state.regionBlocked;
      },
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const env = process.env as Record<string, string | undefined>;
const savedIds = env.EPISODE_TRANSLATION_ALLOWED_EPISODE_IDS;
const savedSeries = env.EPISODE_TRANSLATION_ALLOWED_SERIES_EPISODES;

async function main() {
  try {
    const server = await import("../src/lib/translation/episodeTranslationServer");

    assert.equal(server.TRANSLATION_SEGMENT_VERSION, 3);
    assert.equal(server.isSeriesTranslationEligible({ id: "s", translation_permission_mode: "open" }), true);
    assert.equal(server.isSeriesTranslationEligible({ id: "s", translation_permission_mode: "closed" }), false);
    assert.equal(await server.isSeriesTranslationEligibleIncludingOfficial({ id: "s" }), false);

    // Source hash (versioned, optional cache variant).
    const body = "吾輩は猫である。\r\n名前はまだ無い。";
    const prefix = "episode-translation-source-v2\0segment-v3\0" + normalizeTranslationSourceText(body);
    assert.equal(server.buildEpisodeTranslationSourceHash(body), createHash("sha256").update(prefix, "utf8").digest("hex"));
    assert.equal(
      server.buildEpisodeTranslationSourceHash(body, { glossary: 1 }),
      createHash("sha256").update(prefix + "\0variant-v1\0" + JSON.stringify({ glossary: 1 }), "utf8").digest("hex")
    );
    assert.equal(server.buildEpisodeTranslationSourceHash(body, null), server.buildEpisodeTranslationSourceHash(body));
    assert.deepEqual(server.buildEpisodeTranslationSource(body), segmentSourceDocument(body, "ja"));

    // Allowlist via env (episode ids or series:number pairs).
    delete env.EPISODE_TRANSLATION_ALLOWED_EPISODE_IDS;
    delete env.EPISODE_TRANSLATION_ALLOWED_SERIES_EPISODES;
    assert.equal(server.isEpisodeTranslationAllowlisted({ episodeId: "e1", seriesId: "s1", episodeNumber: 1 }), false);
    env.EPISODE_TRANSLATION_ALLOWED_EPISODE_IDS = " e1 , e2 ";
    env.EPISODE_TRANSLATION_ALLOWED_SERIES_EPISODES = "s9:3";
    assert.equal(server.isEpisodeTranslationAllowlisted({ episodeId: "e2", seriesId: "x", episodeNumber: 1 }), true);
    assert.equal(server.isEpisodeTranslationAllowlisted({ episodeId: null, seriesId: "s9", episodeNumber: 3 }), true);
    assert.equal(server.isEpisodeTranslationAllowlisted({ episodeId: null, seriesId: "s9", episodeNumber: 4 }), false);

    // Access resolution.
    assert.equal(await server.resolveEpisodeTranslationAccess("  "), null);
    state.episode = { id: "e1", series_id: "s1", episode_number: 2, body, posting_status: "posted", is_published: true };
    state.series = { id: "s1", author_id: "owner", publication_status: "public", content_rating: "general", translation_permission_mode: "open", source_language: "ja" };
    const anonymous = await server.resolveEpisodeTranslationAccess(" e1 ");
    assert.ok(anonymous);
    assert.equal(anonymous.canRead, true);
    assert.equal(anonymous.isOwner, false);
    assert.equal(anonymous.isAllowlisted, true);
    assert.equal(anonymous.seriesId, "s1");
    assert.equal(anonymous.sourceLanguage, "ja");
    assert.equal(anonymous.currentUserId, null);
    assert.deepEqual(state.regionChecks.at(-1), ["s1", "JP"]);

    // Closed translation permission is never bypassed (even for the owner).
    state.series = { ...state.series, translation_permission_mode: "closed" };
    state.user = { id: "owner", email: "owner@example.invalid" };
    const owner = await server.resolveEpisodeTranslationAccess("e1");
    assert.equal(owner?.isOwner, true);
    assert.equal(owner?.isAllowlisted, false);

    // Private work: owner can read, others cannot.
    state.series = { ...state.series, publication_status: "private" };
    assert.equal((await server.resolveEpisodeTranslationAccess("e1"))?.canRead, true);
    state.user = { id: "reader" };
    assert.equal((await server.resolveEpisodeTranslationAccess("e1"))?.canRead, false);

    // R18 requires the viewer preference; region block applies to everyone (owner included).
    state.series = { ...state.series, publication_status: "public", content_rating: "r18" };
    state.showR18 = false;
    assert.equal((await server.resolveEpisodeTranslationAccess("e1"))?.canRead, false);
    state.showR18 = true;
    assert.equal((await server.resolveEpisodeTranslationAccess("e1"))?.canRead, true);
    state.series = { ...state.series, content_rating: "general" };
    state.regionBlocked = true;
    state.user = { id: "owner" };
    assert.equal((await server.resolveEpisodeTranslationAccess("e1"))?.canRead, false);
    state.regionBlocked = false;

    // Draft episode of a public work is not public.
    state.user = null;
    state.episode = { ...state.episode, posting_status: "draft", is_published: false };
    assert.equal((await server.resolveEpisodeTranslationAccess("e1"))?.canRead, false);

    // Missing rows -> null.
    state.episode = { id: "e1" };
    assert.equal(await server.resolveEpisodeTranslationAccess("e1"), null, "episode without series id");
    state.episode = null;
    assert.equal(await server.resolveEpisodeTranslationAccess("e1"), null);
    state.episode = { id: "e1", series_id: "s1" };
    state.series = null;
    assert.equal(await server.resolveEpisodeTranslationAccess("e1"), null);
  } finally {
    if (savedIds === undefined) delete env.EPISODE_TRANSLATION_ALLOWED_EPISODE_IDS;
    else env.EPISODE_TRANSLATION_ALLOWED_EPISODE_IDS = savedIds;
    if (savedSeries === undefined) delete env.EPISODE_TRANSLATION_ALLOWED_SERIES_EPISODES;
    else env.EPISODE_TRANSLATION_ALLOWED_SERIES_EPISODES = savedSeries;
    moduleWithLoad._load = originalLoad;
  }

  console.log("PASS: episode translation server (source hash, allowlist, access: publication/owner/R18/region/permission)");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
