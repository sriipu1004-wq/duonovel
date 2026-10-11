import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { collectBookmarkedSeriesIds, type BookmarkedSeriesIdPage } from "../src/lib/search/searchSavedBookmarkIds";
import { matchesPublicSearchConditions } from "../src/lib/search/publicSearchConditions";
import { clampPublicSearchPage, PUBLIC_SEARCH_PAGE_SIZE } from "../src/lib/search/publicSearchPagination";

type Row = { series_id: string };
const ids = Array.from({ length: 1253 }, (_, i) => ({
  series_id: `work-${String(i).padStart(4, "0")}`,
}));

function sourceContracts() {
  const source = readFileSync("src/app/search/SearchPageLegacy.tsx", "utf8");
  assert.ok(source.includes('savedFilter === "bookmarked-works"'), "Normal Search must fetch bookmarks");
  assert.ok(source.includes('.from("user_series_bookmarks")'), "Read the canonical bookmark table");
  assert.ok(source.includes('.select("series_id", { count: "exact" })'), "Verify the complete RLS-filtered result count");
  assert.ok(source.includes('.eq("user_id", currentUser.id)'), "Owner-scope the bookmark lookup");
  assert.ok(source.includes('.order("id", { ascending: true })'), "Use deterministic unique-key paging");
  assert.ok(source.includes(".range(from, to)"), "Page beyond the first 1,000 bookmarks");
  assert.ok(source.includes("savedFilterDataUnavailable = true"), "Failures must not become empty sets");
  assert.ok(source.includes("savedFilterAuthUnavailable = true"), "Auth outages must not mean signed out");
  assert.ok(source.includes("savedFilter && !savedFilterUnavailable && !currentUser"));
  assert.ok(source.includes("publicWorksAvailable && !savedFilterUnavailable"));
  assert.ok(source.includes("保存一覧が0件という意味ではない"));
  assert.ok(source.includes("const totalResultCount = sortedWorks.length"));
  assert.ok(source.includes("const languageFacetWorks"));
  assert.ok(source.includes("const paginatedWorks = sortedWorks.slice"));
}

async function fetchAll(pageSize = 500) {
  const pages: Array<[number, number]> = [];
  const result = await collectBookmarkedSeriesIds(async (from, to) => {
    pages.push([from, to]);
    return { data: ids.slice(from, to + 1), count: ids.length, error: null };
  }, pageSize);
  return { result, pages };
}

async function main() {
  sourceContracts();

  const { result, pages } = await fetchAll();
  assert.deepEqual(pages, [[0, 499], [500, 999], [1000, 1499]]);
  assert.equal(result.size, ids.length);
  assert.ok(result.has(ids[1252].series_id), "Bookmark IDs after index 1,000 must be retained");

  assert.deepEqual([...await collectBookmarkedSeriesIds(async () => ({
    data: [], count: 0, error: null,
  }))], []);
  assert.equal((await collectBookmarkedSeriesIds(async (from, to) => ({
    data: ids.slice(from, Math.min(to + 1, 1000)), count: 1000, error: null,
  }))).size, 1000, "Exactly 1,000 results should be treated as complete");

  await assert.rejects(collectBookmarkedSeriesIds(async (from, to) => ({
    data: ids.slice(from, to + 1).slice(0, 300),
    count: ids.length,
    error: null,
  })), /truncated page/, "A server-side row cap below the requested size must be detected");

  await assert.rejects(collectBookmarkedSeriesIds(async (from, to): Promise<BookmarkedSeriesIdPage> => ({
    data: from === 0 ? ids.slice(0, 500) : null,
    count: ids.length,
    error: from === 0 ? null : { message: "network outage" },
  })), /network outage/, "Failure on a later page must not publish a partial result");

  await assert.rejects(collectBookmarkedSeriesIds(async (from, to) => ({
    data: ids.slice(from, to + 1),
    count: from === 0 ? ids.length : ids.length + 1,
    error: null,
  })), /changed during pagination/);

  await assert.rejects(collectBookmarkedSeriesIds(async () => ({
    data: [], count: null, error: null,
  })), /incomplete response/);

  await assert.rejects(collectBookmarkedSeriesIds(async () => ({
    data: [{ series_id: "" }], count: 1, error: null,
  })), /invalid series ID/);

  // Full public catalog is the source of truth for public visibility, not
  // user-owned bookmark rows. Private bookmarked IDs never enter Search.
  const publicWorks = Array.from({ length: 1280 }, (_, i) => ({
    seriesId: ids[i].series_id,
    authorId: `author-${i % 3}`,
    tags: [i % 2 ? "#History" : "#Fantasy"],
    genres: [i % 3 ? "Novel" : "Fantasy"],
    latestPostedAtValue: i,
  }));
  const bookmarked = await collectBookmarkedSeriesIds(async (from, to) => ({
    data: ids.slice(from, to + 1), count: ids.length, error: null,
  }));
  const matches = (ignoredFacet?: "tag" | "genre") => publicWorks.filter((work) =>
    matchesPublicSearchConditions({
      work,
      matchScore: 1,
      selectedTagTokens: ["fantasy"],
      selectedGenreTokens: ["fantasy"],
      ignoredFacet,
      order: "updated",
      startAtValue: 0,
      endAtValue: 1279,
      savedFilter: "bookmarked-works",
      savedFilterRequiresLogin: false,
      savedAuthorIds: new Set(),
      savedSeriesIds: bookmarked,
    })
  );
  const results = matches();
  assert.ok(results.length > 0);
  assert.ok(results.every(w => w.tags.includes("#Fantasy") && w.genres.includes("Fantasy")));
  assert.ok(matches("tag").length >= results.length);
  assert.ok(matches("genre").length >= results.length);
  assert.ok(!publicWorks.some(w => w.seriesId === ids[1252].series_id) || bookmarked.has(ids[1252].series_id));
  assert.ok(!publicWorks.some(w => w.seriesId === ids[1300]?.series_id), "Out-of-catalog bookmarks must not leak");
  const pagesCount = Math.max(1, Math.ceil(results.length / PUBLIC_SEARCH_PAGE_SIZE));
  for (const request of [1, 2, 50, 999]) {
    const page = clampPublicSearchPage(request, pagesCount);
    const actual = results.slice((page - 1) * PUBLIC_SEARCH_PAGE_SIZE, page * PUBLIC_SEARCH_PAGE_SIZE);
    assert.ok(actual.length <= PUBLIC_SEARCH_PAGE_SIZE);
    assert.deepEqual(actual.map(w => w.seriesId), results.slice((page - 1) * PUBLIC_SEARCH_PAGE_SIZE, page * PUBLIC_SEARCH_PAGE_SIZE).map(w => w.seriesId));
  }
  assert.equal(matchesPublicSearchConditions({
    work: publicWorks[0], matchScore: 1,
    selectedTagTokens: [], selectedGenreTokens: [], order: "popular",
    startAtValue: 0, endAtValue: 9999, savedFilter: "bookmarked-works",
    savedFilterRequiresLogin: true, savedAuthorIds: new Set(),
    savedSeriesIds: bookmarked,
  }), false, "Signed-out viewers cannot use saved filters");

  console.log("PASS: Child84f complete bookmark pages, RLS caller contract, failures, and public Search integration");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
