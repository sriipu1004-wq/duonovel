import assert from "node:assert/strict";
import { join } from "node:path";
import {
  checkAllowlist,
  RESTRICTED_TABLES,
  scanSource,
  scanTree,
  type AllowEntry,
  type Occurrence,
} from "./issue216-restricted-table-scan/scan";

// Issue #216 (KD-4) static guard. Per-country restricted works (D030) hide
// their `episodes`, `recordings` and `episode_human_translations` rows from
// every anon / non-author session through RESTRICTIVE RLS. A read of these
// tables through a session or anon client therefore silently returns nothing
// for a restricted work, even in an allowed country.
//
// Every `.from("<table>")` read of these tables anywhere in src/ (server,
// client components, helpers that receive a client from requireLoggedInUser
// or as a parameter) must be in the allowlist below with its exact count:
// - "admin": service-role read; the scanner must resolve each receiver to the
//   service role, except `unresolvedAdmin` reads checked by hand;
// - "author": session read on a path only the work's author reaches (the
//   RESTRICTIVE policies keep the author exception);
// - "anon-supplemented": anon public read whose restricted-work rows are added
//   through the service role (restrictedWorkPublicReads.server.ts);
// - "known-gap": a non-author viewer read that still fails closed for a
//   restricted work; listed so it stays visible, not because it is correct.
// A new read, a changed count or a stale entry fails the test.

const A = (count: number, reason: string, unresolvedAdmin?: number): AllowEntry => ({
  kind: "admin",
  count,
  reason,
  ...(unresolvedAdmin === undefined ? {} : { unresolvedAdmin }),
});
const AUTHOR = (count: number, reason: string): AllowEntry => ({ kind: "author", count, reason });

const SR = "Service role (resolved by the scanner).";

// key: "<path from src, forward slashes>::<table>"
export const ALLOWLIST: Record<string, AllowEntry> = {
  "app/actions/saveOwnedEpisode.ts::episodes": AUTHOR(
    4,
    "Author-only Server Action: series ownership (author_id = signed-in user) is verified before these reads/writes."
  ),
  "app/api/human-translations/draft/route.ts::episode_human_translations": A(3, SR),
  "app/api/human-translations/episode/[episodeId]/route.ts::episode_human_translations": A(1, SR),
  "app/api/human-translations/[translationId]/publish/route.ts::episode_human_translations": A(2, SR),
  "app/api/human-translations/[translationId]/route.ts::episode_human_translations": A(2, SR),
  "app/api/human-translations/[translationId]/withdraw/route.ts::episode_human_translations": A(1, SR),
  "app/api/popularity/events/route.ts::episodes": A(1, SR),
  "app/api/popularity/events/route.ts::recordings": A(1, SR),
  "app/api/recordings/ai-audio/[recordingId]/route.ts::recordings": A(1, SR),
  "app/api/recordings/human-audio/[recordingId]/route.ts::recordings": A(1, SR),
  "app/api/recordings/human-delete/route.ts::recordings": A(2, SR),
  "app/api/recordings/human-visibility/route.ts::episodes": A(1, SR),
  "app/api/recordings/human-visibility/route.ts::recordings": A(1, SR),
  "app/authors/[authorId]/page.tsx::episodes": A(1, SR),
  "app/authors/[authorId]/page.tsx::recordings": A(2, SR),
  "app/record/create/[seriesId]/page.tsx::recordings": A(2, SR),
  "app/record/page.tsx::episodes": A(1, SR),
  "app/record/page.tsx::recordings": A(3, SR),
  "app/search/reader/[readerId]/page.tsx::episodes": A(1, SR),
  "app/search/reader/[readerId]/page.tsx::recordings": A(2, SR),
  "app/translate/[seriesId]/[episodeNumber]/page.tsx::episodes": A(1, SR),
  "app/works/[seriesId]/opengraph-image.tsx::episodes": A(1, SR),
  "app/works/[seriesId]/page.tsx::episodes": A(3, SR),
  "app/works/[seriesId]/page.tsx::recordings": A(2, SR),
  "app/write/page.tsx::episodes": AUTHOR(
    2,
    "Writing top: episodes of the series returned by fetchOwnedSeries for the signed-in user (own works)."
  ),
  "app/write/series/[seriesId]/episodes/new/page.tsx::episodes": AUTHOR(
    1,
    "Client comes from requireOwnedSeries (owner-checked work)."
  ),
  "app/write/series/[seriesId]/episodes/[episodeId]/page.tsx::episodes": AUTHOR(
    2,
    "Client comes from requireOwnedSeries (owner-checked work)."
  ),
  "app/write/series/[seriesId]/page.tsx::episodes": AUTHOR(
    1,
    "Client comes from requireOwnedSeries (owner-checked work)."
  ),
  "features/bookmark/BookmarkedSeriesList.tsx::episodes": {
    kind: "known-gap",
    count: 1,
    reason:
      "Browser client (viewer session) on the bookmark list: a restricted work's episode info is missing for non-authors. Not in #216's table; reported in PR #247.",
  },
  "features/bookmark/ContinueReadingButton.tsx::recordings": {
    kind: "known-gap",
    count: 1,
    reason:
      "Browser client (viewer session) for continue-reading: restricted works fall back to no recording. Not in #216's table; reported in PR #247.",
  },
  "features/bookmark/ContinueReadingCard.tsx::episodes": {
    kind: "known-gap",
    count: 1,
    reason:
      "Browser client (viewer session) for continue-reading: restricted works show no episode info. Not in #216's table; reported in PR #247.",
  },
  "features/bookmark/ContinueReadingCard.tsx::recordings": {
    kind: "known-gap",
    count: 1,
    reason:
      "Browser client (viewer session) for continue-reading: restricted works show no recording info. Not in #216's table; reported in PR #247.",
  },
  "lib/auth/publicDisplayName.server.ts::recordings": A(2, SR),
  "lib/publicRead.ts::episodes": A(2, SR),
  "lib/publicRead.ts::recordings": A(2, SR),
  "lib/publicWorks.ts::episodes": {
    kind: "anon-supplemented",
    count: 1,
    reason:
      "Anon read in the fallback used only when public_episode_work_summaries is missing; restricted works are added by fetchRestrictedPublicEpisodes (#216).",
  },
  "lib/publicWorks.ts::recordings": {
    kind: "anon-supplemented",
    count: 1,
    reason:
      "Anon public aggregate read kept by #137; restricted works are added by fetchRestrictedPublicRecordings (#216).",
  },
  "lib/recording/aivisAutoGeneration.ts::episodes": A(2, SR),
  "lib/recording/aivisAutoGeneration.ts::recordings": A(3, SR),
  "lib/recording/aivisGeneration.ts::episodes": A(1, SR),
  "lib/recording/aivisGeneration.ts::recordings": A(3, SR),
  "lib/recording/humanMediaCleanup.ts::recordings": A(
    1,
    "`admin: CleanupAdmin`, a Pick<> of ReturnType<typeof createAdminClient> the scanner does not resolve.",
    1
  ),
  "lib/recording/humanRecordingPublish.ts::episodes": A(3, SR),
  "lib/recording/humanRecordingPublish.ts::recordings": A(1, SR),
  "lib/recording/nemoAutoGeneration.ts::episodes": A(2, SR),
  "lib/recording/nemoAutoGeneration.ts::recordings": A(2, SR),
  "lib/recording/nemoGeneration.ts::episodes": A(1, SR),
  "lib/recording/nemoGeneration.ts::recordings": A(4, SR),
  "lib/recording/nemoGenerationQueue.ts::episodes": A(2, SR),
  "lib/recording/nemoGenerationQueue.ts::recordings": A(1, SR),
  "lib/recording/privateMediaSourceAccess.ts::episodes": A(1, SR),
  "lib/recording/recordingTargetAccess.server.ts::episodes": A(2, SR),
  "lib/rights/restrictedWorkPublicReads.server.ts::episodes": A(2, SR),
  "lib/rights/restrictedWorkPublicReads.server.ts::recordings": A(1, SR),
  "lib/sitemap/loadSitemapEpisodeDates.ts::episodes": A(1, SR),
  "lib/translation/episodeTranslationServer.ts::episodes": A(
    1,
    "`admin` is destructured from Promise.all([createClient(), createAdminClient()]), which the scanner does not resolve.",
    1
  ),
  "lib/translation/humanTranslationServer.ts::episode_human_translations": A(1, SR),
  "lib/translation/publicWorkTranslations.ts::episodes": A(1, SR),
  "lib/translation/seriesTranslationConsistencyServer.ts::episodes": A(2, SR),
  "lib/updates/followingUpdates.server.ts::episodes": A(1, SR),
};

function selfChecks() {
  const fixture = `
    import { createAdminClient } from "@/lib/supabase/admin";
    const admin = createAdminClient();
    await admin.from("episodes").select("*");
    await createAdminClient().from("recordings").select("*");
    const { supabase } = await requireLoggedInUser("/x");
    await supabase
      .from("episodes")
      .select("*");
    // supabase.from("recordings") in a comment is ignored
    async function a() { const supabase = createAdminClient(); return supabase.from("episodes"); }
    async function b(args: { adminSupabase: ReturnType<typeof createAdminClient> }) {
      return args.adminSupabase.from("recordings");
    }
    async function c(client: AdminSupabase) { return client.from("recordings"); }
    async function d(client: ServerSupabase) { return client.from("episode_human_translations"); }
  `;
  const occ = scanSource(fixture);
  assert.deepEqual(
    occ.map((o) => `${o.table}:${o.admin ? "admin" : "other"}`),
    [
      "episodes:admin",
      "recordings:admin",
      "episodes:other", // session client from requireLoggedInUser, no factory import
      "episodes:admin", // nearest declaration wins inside a()
      "recordings:admin",
      "recordings:admin",
      "episode_human_translations:other",
    ]
  );
  // Client components are scanned too.
  assert.equal(scanSource(`"use client";\nconst x = 1;\nsupabase.from("recordings")`)[0]?.admin, false);

  // The check fails for a new read, a changed count, an unresolved admin read
  // and a stale entry.
  const found = new Map<string, Occurrence[]>([
    ["lib/x.ts", [{ table: "episodes", line: 1, receiver: "admin", admin: true }]],
  ]);
  const ok: Record<string, AllowEntry> = { "lib/x.ts::episodes": A(1, SR) };
  assert.deepEqual(checkAllowlist(found, ok), []);
  const withNewRead = new Map(found);
  withNewRead.set("lib/y.ts", [{ table: "recordings", line: 9, receiver: "supabase", admin: false }]);
  assert.match(checkAllowlist(withNewRead, ok).join("\n"), /not allowlisted: lib\/y\.ts::recordings/);
  const withExtra = new Map<string, Occurrence[]>([
    ["lib/x.ts", [...found.get("lib/x.ts")!, { table: "episodes", line: 5, receiver: "admin", admin: true }]],
  ]);
  assert.match(checkAllowlist(withExtra, ok).join("\n"), /count changed: lib\/x\.ts::episodes/);
  const sessionUnderAdmin = new Map<string, Occurrence[]>([
    ["lib/x.ts", [{ table: "episodes", line: 1, receiver: "supabase", admin: false }]],
  ]);
  assert.match(checkAllowlist(sessionUnderAdmin, ok).join("\n"), /not resolved to the service role/);
  assert.match(checkAllowlist(new Map(), ok).join("\n"), /stale allowlist entry/);
}

function main() {
  selfChecks();

  const found = scanTree(join(process.cwd(), "src"));
  const problems = checkAllowlist(found, ALLOWLIST);

  // The #216 targets must not read these tables through a non-admin client.
  for (const fixed of [
    "app/record/create/[seriesId]/page.tsx",
    "app/api/recordings/human-upload-session/route.ts",
    "app/api/recordings/human-upload-finalize/route.ts",
    "app/api/recordings/human-publish/route.ts",
    "app/api/recordings/nemo-generate/route.ts",
    "app/api/recordings/aivis-generate/route.ts",
    "lib/recording/nemoGeneration.ts",
    "lib/recording/aivisGeneration.ts",
  ]) {
    for (const occurrence of found.get(fixed) ?? []) {
      assert.equal(occurrence.admin, true, `${fixed}:${occurrence.line} must read ${occurrence.table} via the service role`);
    }
  }

  assert.deepEqual(problems, [], problems.join("\n"));
  const total = Array.from(found.values()).reduce((sum, list) => sum + list.length, 0);
  console.log(
    `PASS: restricted-table scan (${total} reads of ${RESTRICTED_TABLES.join(", ")} in ${found.size} files, all allowlisted)`
  );
}

main();
