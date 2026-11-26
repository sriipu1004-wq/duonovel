// P9 PR-P9-5: in-site "new episodes you follow" list. Pure selection logic
// (bookmark / followed author, R18, D030 country restriction, own works,
// window, read markers) plus source checks that the loader reads only the
// viewer's own rows and that the home page wires the section in. No network.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  applyLocalReadEpisode,
  FOLLOWING_UPDATES_MAX_EPISODES_PER_WORK,
  runFollowingUpdates,
  type FollowingUpdateEpisode,
  type FollowingUpdatesDeps,
  buildFollowingUpdates,
  firstNewEpisodeNumber,
  followingUpdatesSince,
  selectFollowedWorks,
  type FollowingUpdateWork,
} from "../src/lib/updates/followingUpdates";
import { parseRegionRestrictionRows } from "../src/lib/rights/regionRestriction";

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");

const VIEWER = "11111111-1111-4111-8111-111111111111";
const AUTHOR_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const AUTHOR_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const BOOKMARKED = "10000000-0000-4000-8000-000000000001";
const BY_FOLLOWED = "10000000-0000-4000-8000-000000000002";
const NOT_FOLLOWED = "10000000-0000-4000-8000-000000000003";
const R18_WORK = "10000000-0000-4000-8000-000000000004";
const BLOCKED_US = "10000000-0000-4000-8000-000000000005";
const ALLOW_JP = "10000000-0000-4000-8000-000000000006";
const OWN_WORK = "10000000-0000-4000-8000-000000000007";
const STALE = "10000000-0000-4000-8000-000000000008";
const OTHERS_BOOKMARK = "10000000-0000-4000-8000-000000000009";
const OTHER_USER = "22222222-2222-4222-8222-222222222222";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 10, 19, 12, 0, 0);
const SINCE = followingUpdatesSince(NOW);

function work(
  seriesId: string,
  overrides: Partial<FollowingUpdateWork> = {}
): FollowingUpdateWork {
  return {
    seriesId,
    title: `title-${seriesId.slice(-1)}`,
    authorId: AUTHOR_B,
    authorName: "author",
    contentRating: "general",
    latestPostedAtValue: NOW - DAY,
    ...overrides,
  };
}

const WORKS: FollowingUpdateWork[] = [
  work(BOOKMARKED),
  work(BY_FOLLOWED, { authorId: AUTHOR_A }),
  work(NOT_FOLLOWED),
  work(R18_WORK, { contentRating: "r18" }),
  work(BLOCKED_US),
  work(ALLOW_JP),
  work(OWN_WORK, { authorId: VIEWER }),
  work(STALE, { latestPostedAtValue: NOW - 90 * DAY }),
  work(OTHERS_BOOKMARK),
];

const REGION_MAP = parseRegionRestrictionRows([
  { series_id: BLOCKED_US, blocked_countries: ["US"], allowed_countries: null },
  { series_id: ALLOW_JP, blocked_countries: null, allowed_countries: ["JP"] },
]);

// The viewer's own bookmarks and follows (selection input). Rows of another
// user are dropped earlier, in runFollowingUpdates (tested below).
const bookmarkedSeriesIds = new Set([
  BOOKMARKED,
  R18_WORK,
  BLOCKED_US,
  ALLOW_JP,
  OWN_WORK,
  STALE,
]);
const followedAuthorIds = new Set([AUTHOR_A]);

function select(country: string | null, showR18 = false) {
  return selectFollowedWorks({
    works: WORKS,
    bookmarkedSeriesIds,
    followedAuthorIds,
    viewerUserId: VIEWER,
    showR18,
    regionMap: REGION_MAP,
    country,
    sinceValue: SINCE,
  }).map((selected) => selected.seriesId);
}

// --- selection: bookmark and followed author only
{
  const ids = select("JP");
  assert.ok(ids.includes(BOOKMARKED), "bookmarked work is included");
  assert.ok(ids.includes(BY_FOLLOWED), "work by a followed author is included");
  assert.ok(!ids.includes(NOT_FOLLOWED), "unrelated work is excluded");
  assert.ok(!ids.includes(OWN_WORK), "own work is excluded");
  assert.ok(!ids.includes(STALE), "work without a recent update is excluded");
}

// --- selection: R18 only with the viewer's opt-in
assert.ok(!select("JP", false).includes(R18_WORK), "R18 hidden without opt-in");
assert.ok(select("JP", true).includes(R18_WORK), "R18 shown with opt-in");

// --- selection: D030 country restriction, fail closed for unknown country
{
  const us = select("US");
  assert.ok(!us.includes(BLOCKED_US), "blocked country: work withheld");
  assert.ok(!us.includes(ALLOW_JP), "allow list: other country withheld");
  const jp = select("JP");
  assert.ok(jp.includes(BLOCKED_US), "not blocked in JP");
  assert.ok(jp.includes(ALLOW_JP), "allowed in JP");
  const unknown = select(null);
  assert.ok(!unknown.includes(BLOCKED_US), "unknown country: restricted work withheld");
  assert.ok(!unknown.includes(ALLOW_JP), "unknown country: allow-list work withheld");
  assert.ok(unknown.includes(BOOKMARKED), "unknown country: unrestricted work kept");
}

// --- selection: reasons
{
  const selected = selectFollowedWorks({
    works: [work(BOOKMARKED, { authorId: AUTHOR_A })],
    bookmarkedSeriesIds: new Set([BOOKMARKED]),
    followedAuthorIds: new Set([AUTHOR_A]),
    viewerUserId: VIEWER,
    showR18: false,
    regionMap: REGION_MAP,
    country: "JP",
    sinceValue: SINCE,
  });
  assert.deepEqual(selected[0].reasons, ["bookmark", "author"]);
}

// --- grouping: window, future posts, read markers, unselected works
{
  const works = selectFollowedWorks({
    works: WORKS,
    bookmarkedSeriesIds,
    followedAuthorIds,
    viewerUserId: VIEWER,
    showR18: false,
    regionMap: REGION_MAP,
    country: "US",
    sinceValue: SINCE,
  });
  const items = buildFollowingUpdates({
    works,
    episodes: [
      { seriesId: BY_FOLLOWED, episodeNumber: 9, title: "now-private", postedAtValue: NOW - DAY, seriesPublicationStatus: "private" },
      { seriesId: BY_FOLLOWED, episodeNumber: 10, title: "no-status", postedAtValue: NOW - DAY, seriesPublicationStatus: null },
      { seriesId: BOOKMARKED, episodeNumber: 3, title: "three", postedAtValue: NOW - 2 * DAY, seriesPublicationStatus: "public" },
      { seriesId: BOOKMARKED, episodeNumber: 4, title: "four", postedAtValue: NOW - DAY, seriesPublicationStatus: "public" },
      { seriesId: BOOKMARKED, episodeNumber: 4, title: "dup", postedAtValue: NOW - DAY, seriesPublicationStatus: "public" },
      { seriesId: BOOKMARKED, episodeNumber: 2, title: "old", postedAtValue: NOW - 40 * DAY, seriesPublicationStatus: "public" },
      { seriesId: BOOKMARKED, episodeNumber: 5, title: "future", postedAtValue: NOW + DAY, seriesPublicationStatus: "public" },
      { seriesId: BY_FOLLOWED, episodeNumber: 7, title: "read", postedAtValue: NOW - 3 * DAY, seriesPublicationStatus: "public" },
      { seriesId: BLOCKED_US, episodeNumber: 1, title: "withheld", postedAtValue: NOW - DAY, seriesPublicationStatus: "public" },
      { seriesId: NOT_FOLLOWED, episodeNumber: 1, title: "x", postedAtValue: NOW - DAY, seriesPublicationStatus: "public" },
      { seriesId: OTHERS_BOOKMARK, episodeNumber: 1, title: "x", postedAtValue: NOW - DAY, seriesPublicationStatus: "public" },
    ],
    readMarkers: [
      { seriesId: BY_FOLLOWED, episodeNumber: 7 },
      { seriesId: NOT_FOLLOWED, episodeNumber: 99 },
    ],
    sinceValue: SINCE,
    nowValue: NOW,
  });
  assert.deepEqual(
    items.map((item) => item.seriesId),
    [BOOKMARKED],
    "only selected, unread, in-window works of a live-public series"
  );
  assert.deepEqual(
    items[0].newEpisodes.map((episode) => episode.episodeNumber),
    [4, 3],
    "newest first; old, duplicate and scheduled-future episodes excluded"
  );
  assert.equal(firstNewEpisodeNumber(items[0]), 3, "read starts at the first new episode");

  // Client refinement with the browser's own reading history.
  assert.deepEqual(
    applyLocalReadEpisode(items[0], 3)?.newEpisodes.map((episode) => episode.episodeNumber),
    [4]
  );
  assert.equal(applyLocalReadEpisode(items[0], 4), null, "all read: item disappears");
  assert.equal(applyLocalReadEpisode(items[0], null)?.newEpisodes.length, 2);
}

// --- limit
{
  const many = Array.from({ length: 10 }, (_, index) =>
    work(`20000000-0000-4000-8000-00000000000${index}`)
  );
  const selected = selectFollowedWorks({
    works: many,
    bookmarkedSeriesIds: new Set(many.map((item) => item.seriesId)),
    followedAuthorIds: new Set(),
    viewerUserId: VIEWER,
    showR18: false,
    regionMap: new Map(),
    country: "JP",
    sinceValue: SINCE,
  });
  const items = buildFollowingUpdates({
    works: selected,
    episodes: many.map((item, index) => ({
      seriesId: item.seriesId,
      episodeNumber: 1,
      title: "",
      postedAtValue: NOW - index * 1000,
      seriesPublicationStatus: "public",
    })),
    readMarkers: [],
    sinceValue: SINCE,
    nowValue: NOW,
  });
  assert.equal(items.length, 6, "home shows at most 6 works");
}


// --- loader: other users' rows, live publication status, per-work fairness,
// region read failure
async function loaderTests() {
  const episodesFor = new Map<string, FollowingUpdateEpisode[]>();
  const asked: Array<{ seriesId: string; limit: number }> = [];
  const baseDeps = (overrides: Partial<FollowingUpdatesDeps> = {}): FollowingUpdatesDeps => ({
    userId: VIEWER,
    nowValue: NOW,
    readViewerRows: async () => ({
      bookmarks: [
        { user_id: VIEWER, series_id: BOOKMARKED },
        // Another user's row returned by a broken source: must be dropped.
        { user_id: OTHER_USER, series_id: OTHERS_BOOKMARK },
        { series_id: NOT_FOLLOWED },
      ],
      follows: [
        { follower_user_id: VIEWER, followed_author_id: AUTHOR_A },
        { follower_user_id: OTHER_USER, followed_author_id: AUTHOR_B },
      ],
      playLogs: [
        { user_id: OTHER_USER, series_id: BOOKMARKED, episode_number: 99 },
      ],
    }),
    loadWorks: async () => WORKS,
    loadShowR18: async () => false,
    loadRegionMap: async () => REGION_MAP,
    country: "JP",
    loadEpisodesForSeries: async ({ seriesId, limit }) => {
      asked.push({ seriesId, limit });
      return (episodesFor.get(seriesId) ?? []).slice(0, limit);
    },
    ...overrides,
  });
  const ep = (seriesId: string, episodeNumber: number, status: string | null = "public"): FollowingUpdateEpisode => ({
    seriesId,
    episodeNumber,
    title: `e${episodeNumber}`,
    postedAtValue: NOW - DAY - episodeNumber,
    seriesPublicationStatus: status,
  });
  // BOOKMARKED posts 100 episodes; BY_FOLLOWED posts one. Per-work reads keep both.
  episodesFor.set(BOOKMARKED, Array.from({ length: 100 }, (_, index) => ep(BOOKMARKED, 100 - index)));
  episodesFor.set(BY_FOLLOWED, [ep(BY_FOLLOWED, 1)]);
  episodesFor.set(OTHERS_BOOKMARK, [ep(OTHERS_BOOKMARK, 1)]);
  episodesFor.set(NOT_FOLLOWED, [ep(NOT_FOLLOWED, 1)]);

  const result = await runFollowingUpdates(baseDeps());
  const ids = result.items.map((item) => item.seriesId);
  assert.ok(ids.includes(BOOKMARKED));
  assert.ok(ids.includes(BY_FOLLOWED), "a work with one new episode is not pushed out");
  assert.ok(!ids.includes(OTHERS_BOOKMARK), "another user's bookmark row is dropped");
  assert.ok(!ids.includes(NOT_FOLLOWED), "a row without owner id is dropped");
  assert.ok(!asked.some((call) => call.seriesId === OTHERS_BOOKMARK), "no episode read for others' works");
  const bookmarked = result.items.find((item) => item.seriesId === BOOKMARKED);
  assert.equal(
    bookmarked?.newEpisodes.length,
    FOLLOWING_UPDATES_MAX_EPISODES_PER_WORK,
    "another user's play log does not hide episodes; per-work cap applied"
  );
  assert.ok(asked.every((call) => call.limit === FOLLOWING_UPDATES_MAX_EPISODES_PER_WORK));

  // Live status: the work went private after the catalog cache was built.
  episodesFor.set(BY_FOLLOWED, [ep(BY_FOLLOWED, 1, "private")]);
  const afterUnpublish = await runFollowingUpdates(baseDeps());
  assert.ok(
    !afterUnpublish.items.some((item) => item.seriesId === BY_FOLLOWED),
    "episode of a now-private series is never shown"
  );

  // A row of a different work returned for a request is ignored.
  const crossed = await runFollowingUpdates(
    baseDeps({ loadEpisodesForSeries: async () => [ep(NOT_FOLLOWED, 1)] })
  );
  assert.equal(crossed.items.length, 0, "only the requested work's rows are used");

  // Region restriction read failure: the loader rejects (the home section then
  // shows "unavailable"), never "no restrictions".
  await assert.rejects(
    runFollowingUpdates(
      baseDeps({ loadRegionMap: async () => { throw new Error("region restrictions: down"); } })
    ),
    /region restrictions/
  );

  // No follow targets: no catalog / region / episode reads.
  let touched = false;
  const empty = await runFollowingUpdates(
    baseDeps({
      readViewerRows: async () => ({ bookmarks: [], follows: [], playLogs: null }),
      loadWorks: async () => { touched = true; return WORKS; },
    })
  );
  assert.deepEqual(empty, { items: [], hasFollowTargets: false });
  assert.equal(touched, false);
}

// --- source checks: the loader
{
  const loader = read("src/lib/updates/followingUpdates.server.ts");
  assert.match(
    loader,
    /from\("user_series_bookmarks"\)\.select\("user_id, series_id"\)\.eq\("user_id", userId\)/,
    "bookmarks are read for the viewer only"
  );
  // KD-2: author_follows has RLS with no policies; follows come from the
  // server reader for the auth.getUser() user, which must equal userId.
  assert.match(
    loader,
    /readViewerSocialTargets\(\{ supabase, kind: "followed-authors" \}\)/,
    "follows are read for the verified viewer only"
  );
  assert.match(
    loader,
    /!follows\.result\.signedIn \|\| follows\.result\.userId !== userId/,
    "follows of any other user are refused"
  );
  assert.doesNotMatch(loader, /from\("author_follows"\)/, "no session read of author_follows");
  assert.match(
    loader,
    /from\("play_logs"\)\s*\.select\("user_id, series_id, episode_number"\)\s*\.eq\("user_id", userId\)/,
    "reading markers are read for the viewer only"
  );
  // The service role is used only for episode metadata of already-filtered works.
  const adminUses = loader.match(/createAdminClient\(\)/g) ?? [];
  assert.equal(adminUses.length, 1, "one service-role read");
  const episodeBlock = loader.slice(
    loader.indexOf("async function loadEpisodesForSeries"),
    loader.indexOf("export async function loadFollowingUpdates")
  );
  assert.ok(episodeBlock.includes("createAdminClient()"), "service role only in episode read");
  assert.match(episodeBlock, /\.eq\("series_id", args\.seriesId\)/, "one work per query");
  assert.match(episodeBlock, /\.limit\(args\.limit\)/, "per-work limit");
  assert.match(episodeBlock, /\.eq\("series\.publication_status", "public"\)/, "live public check");
  const selects = episodeBlock.match(/run\(\s*"[^"]*"/g) ?? [];
  assert.equal(selects.length, 2);
  for (const select of selects) {
    assert.match(select, /series!inner\(publication_status\)/, "series joined live");
    assert.ok(!/body|content|text/.test(select), "no body text selected");
  }
  assert.match(episodeBlock, /\.eq\("posting_status", "posted"\)/);
  assert.match(episodeBlock, /\.eq\("is_published", true\)/);
  assert.match(episodeBlock, /\.lte\("posted_at", args\.nowIso\)/, "no scheduled future post");
  assert.match(loader, /loadRegionMap: \(\) => loadRegionRestrictionMap\(\)/, "country restriction loaded");
  assert.match(loader, /countryFromHeaders\(requestHeaders\)/, "viewer country from Vercel header");
  assert.match(loader, /visibility: "viewer"/, "public works with viewer R18 preference");
  assert.match(loader, /showR18Content/);
  assert.ok(!/service_role|SUPABASE_SERVICE_ROLE_KEY/.test(loader), "no direct key use");
}

// --- source checks: home wiring and copy
{
  const home = read("src/app/PublicTopPageLegacy.tsx");
  assert.match(home, /<HomeFollowingUpdatesSection/);
  assert.match(home, /if \(!viewerState\.signedIn \|\| !viewerState\.userId\) return null;/);
  assert.match(home, /id="following-updates"/);
  // A failed load (e.g. region restriction read) shows "unavailable".
  assert.match(home, /const body: ReactNode = !result\s*\? notice\(copy\.unavailable\)/);
  assert.match(home, /\} catch \(error\) \{\n\s*console\.warn\(\n\s*"\[home\] following updates unavailable"/);
  const dictionary = read("src/i18n/dictionaries/home.ts");
  const blocks = dictionary.match(/followingUpdates: \{[\s\S]*?\n  \},/g) ?? [];
  assert.equal(blocks.length, 3, "ja / en / ko copy");
  for (const block of blocks) {
    for (const key of ["title", "description", "empty", "noTargets", "reasonBookmark", "reasonAuthor", "newCount", "readFrom", "episode", "unavailable"]) {
      assert.match(block, new RegExp(`\\n    ${key}: "`), `${key} present`);
    }
    for (const key of ["newCount", "readFrom", "episode"]) {
      assert.match(block, new RegExp(`${key}: "[^"]*\\{n\\}`), `${key} has {n}`);
    }
  }
  const list = read("src/features/updates/FollowingUpdatesList.tsx");
  assert.ok(!/localStorage\.setItem/.test(list), "the list writes nothing to the browser");
  assert.ok(!/document\.cookie/.test(list), "no new identifier cookie");
  assert.match(list, /href=\{localizePath\(`\/works\/\$\{item\.seriesId\}`, locale\)\}/);
  assert.match(list, /href=\{localizePath\(`\/read\/\$\{item\.seriesId\}\/\$\{startEpisode\}`, locale\)\}/);
}

loaderTests().then(
  () => console.log("test-p9-following-updates: ok"),
  (error) => {
    console.error(error);
    process.exit(1);
  }
);
