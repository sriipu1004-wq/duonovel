// P9 PR-P9-5: in-site "new episodes you follow" list. Pure selection logic
// (bookmark / followed author, R18, D030 country restriction, own works,
// window, read markers) plus source checks that the loader reads only the
// viewer's own rows and that the home page wires the section in. No network.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  applyLocalReadEpisode,
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

// The viewer's own rows. OTHERS_BOOKMARK is another user's bookmark and is
// never passed in (the loader filters by the viewer's user id).
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
  assert.ok(!ids.includes(OTHERS_BOOKMARK), "another user's bookmark never enters");
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
      { seriesId: BOOKMARKED, episodeNumber: 3, title: "three", postedAtValue: NOW - 2 * DAY },
      { seriesId: BOOKMARKED, episodeNumber: 4, title: "four", postedAtValue: NOW - DAY },
      { seriesId: BOOKMARKED, episodeNumber: 4, title: "dup", postedAtValue: NOW - DAY },
      { seriesId: BOOKMARKED, episodeNumber: 2, title: "old", postedAtValue: NOW - 40 * DAY },
      { seriesId: BOOKMARKED, episodeNumber: 5, title: "future", postedAtValue: NOW + DAY },
      { seriesId: BY_FOLLOWED, episodeNumber: 7, title: "read", postedAtValue: NOW - 3 * DAY },
      { seriesId: BLOCKED_US, episodeNumber: 1, title: "withheld", postedAtValue: NOW - DAY },
      { seriesId: NOT_FOLLOWED, episodeNumber: 1, title: "x", postedAtValue: NOW - DAY },
      { seriesId: OTHERS_BOOKMARK, episodeNumber: 1, title: "x", postedAtValue: NOW - DAY },
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
    "only selected, unread, in-window works"
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
    })),
    readMarkers: [],
    sinceValue: SINCE,
    nowValue: NOW,
  });
  assert.equal(items.length, 6, "home shows at most 6 works");
}

// --- source checks: the loader
{
  const loader = read("src/lib/updates/followingUpdates.server.ts");
  assert.match(
    loader,
    /from\("user_series_bookmarks"\)\.select\("series_id"\)\.eq\("user_id", userId\)/,
    "bookmarks are read for the viewer only"
  );
  assert.match(
    loader,
    /from\("author_follows"\)\s*\.select\("followed_author_id"\)\s*\.eq\("follower_user_id", userId\)/,
    "follows are read for the viewer only"
  );
  assert.match(
    loader,
    /from\("play_logs"\)\s*\.select\("series_id, episode_number"\)\s*\.eq\("user_id", userId\)/,
    "reading markers are read for the viewer only"
  );
  // The service role is used only for episode metadata of already-filtered works.
  const adminUses = loader.match(/createAdminClient\(\)/g) ?? [];
  assert.equal(adminUses.length, 1, "one service-role read");
  const episodeBlock = loader.slice(loader.indexOf("async function loadRecentEpisodes"));
  assert.ok(episodeBlock.includes("createAdminClient()"), "service role only in episode read");
  assert.match(episodeBlock, /\.eq\("posting_status", "posted"\)/);
  assert.match(episodeBlock, /\.eq\("is_published", true\)/);
  assert.match(episodeBlock, /\.lte\("posted_at", nowIso\)/, "no scheduled future post");
  assert.ok(!/body|content_text|\btext\b/.test(episodeBlock.split("\n").filter((line) => line.includes("run(\"")).join("\n")), "no body text selected");
  assert.match(loader, /loadRegionRestrictionMap\(\)/, "country restriction loaded");
  assert.match(loader, /countryFromHeaders\(requestHeaders\)/, "viewer country from Vercel header");
  assert.match(loader, /visibility: "viewer"/, "public works with viewer R18 preference");
  assert.match(loader, /showR18: preference\.showR18Content/);
  assert.ok(!/service_role|SUPABASE_SERVICE_ROLE_KEY/.test(loader), "no direct key use");
}

// --- source checks: home wiring and copy
{
  const home = read("src/app/PublicTopPageLegacy.tsx");
  assert.match(home, /<HomeFollowingUpdatesSection/);
  assert.match(home, /if \(!viewerState\.signedIn \|\| !viewerState\.userId\) return null;/);
  assert.match(home, /id="following-updates"/);
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
}

console.log("test-p9-following-updates: ok");
