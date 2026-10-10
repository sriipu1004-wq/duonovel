import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  clampPublicSearchQuery,
  getPublicSearchMatchScore,
  normalizePublicSearchText,
  PUBLIC_SEARCH_QUERY_MAX_LENGTH,
} from "../src/lib/search/publicSearchMatching";
import {
  buildPublicSearchPaginationItems,
  clampPublicSearchPage,
  parsePublicSearchPage,
  PUBLIC_SEARCH_PAGE_SIZE,
} from "../src/lib/search/publicSearchPagination";
import { matchesPublicSearchConditions } from "../src/lib/search/publicSearchConditions";
import { matchesPublicWorkLanguageFilters } from "../src/lib/search/publicWorkLanguageFilter";
import type { SupportedLanguageTag } from "../src/lib/translation/languageRegistry";
import { buildPublicSearchHref } from "../src/components/search/PublicSearchControls";

const alice = {
  title: "Alice's Adventures in Wonderland",
  originalTitle: "Alice's Adventures in Wonderland",
  summary: "A girl follows a rabbit into a strange world.",
  authorName: "Lewis Carroll",
  tags: ["#Classic", "#Fantasy"],
  genres: ["Fantasy"],
};

const bunchou = {
  title: "文鳥",
  originalTitle: "文鳥",
  summary: "夏目漱石の短編。",
  authorName: "夏目漱石",
  tags: ["#日本文学"],
  genres: ["文学"],
};

const korean = {
  title: "어린 왕자",
  originalTitle: "어린 왕자",
  summary: "",
  authorName: "Antoine de Saint-Exupéry",
  tags: [],
  genres: [],
};

type SearchParityWork = {
  seriesId: string;
  sourceLanguage: SupportedLanguageTag;
  authorId: string | null;
  title: string;
  originalTitle: string | null;
  summary: string;
  authorName: string;
  tags: string[];
  genres: string[];
  latestPostedAtValue: number;
};

type SearchParityCase = {
  query: string;
  languages: SupportedLanguageTag[];
  tagTokens: string[];
  genreTokens: string[];
  ignoredFacet?: "tag" | "genre";
  order: "popular" | "updated";
  start: number;
  end: number;
  savedFilter: string | null;
  unauthenticated: boolean;
};

function verifyLargeSearchResultParity() {
  // Larger than the default PostgREST 1,000-row cap: deliberately contains
  // multiple source languages, fuzzy queries, and ties across page boundaries.
  const works: SearchParityWork[] = Array.from({ length: 1257 }, (_, i) => ({
    seriesId: `work-${String(i).padStart(4, "0")}`,
    sourceLanguage: (["en", "ja", "ko"] as SupportedLanguageTag[])[i % 3],
    authorId: i % 11 === 0 ? null : `author-${i % 17}`,
    title:
      i % 5 === 0 ? "Alice Adventures" :
      i % 5 === 1 ? "Detective Case Files" :
      i % 5 === 2 ? "文鳥" :
      i % 5 === 3 ? "어린 왕자" : `Story ${i}`,
    originalTitle: i % 5 === 2 ? "文鳥" : null,
    summary: i % 2 === 0 ? "An adventurous mystery" : "Daily reading practice",
    authorName: i % 7 === 0 ? "Lewis Carroll" : "Unknown Author",
    tags: i % 3 === 0 ? ["#Classic", "#Mystery"] : ["#Adventure"],
    genres: i % 4 === 0 ? ["Fantasy", "Mystery"] : ["Literature"],
    latestPostedAtValue: 1000 + i,
  }));
  const savedAuthorIds = new Set(["author-2", "author-7"]);
  const savedSeriesIds = new Set(works.filter((_, i) => i % 13 === 0).map((w) => w.seriesId));

  const cases: SearchParityCase[] = [
    { query: "", languages: [], tagTokens: [], genreTokens: [], order: "popular", start: 0, end: 9999, savedFilter: null, unauthenticated: false },
    { query: "Detetive", languages: ["en"], tagTokens: [], genreTokens: [], order: "popular", start: 0, end: 9999, savedFilter: null, unauthenticated: false },
    { query: "文鳥", languages: ["ja"], tagTokens: ["classic"], genreTokens: ["fantasy"], order: "updated", start: 1300, end: 2100, savedFilter: null, unauthenticated: false },
    { query: "어린왕자", languages: ["ko"], tagTokens: ["adventure"], genreTokens: [], ignoredFacet: "tag", order: "popular", start: 0, end: 9999, savedFilter: "followed-authors", unauthenticated: false },
    { query: "Alice", languages: [], tagTokens: ["classic"], genreTokens: ["literature"], ignoredFacet: "genre", order: "updated", start: 1500, end: 1700, savedFilter: "bookmarked-works", unauthenticated: false },
    { query: "", languages: ["ja", "en"], tagTokens: [], genreTokens: ["literature"], ignoredFacet: "tag", order: "updated", start: 1000, end: 2200, savedFilter: "liked-authors", unauthenticated: true },
    { query: "Mystery", languages: [], tagTokens: ["mystery"], genreTokens: ["fantasy"], ignoredFacet: "genre", order: "popular", start: 0, end: 9999, savedFilter: "liked-authors", unauthenticated: false },
  ];

  function referenceMatches(work: SearchParityWork, c: SearchParityCase, score: number): boolean {
    if (score <= 0) return false;
    const tagOk = c.ignoredFacet === "tag" || !c.tagTokens.length ||
      c.tagTokens.every((token) =>
        work.tags.some((tag) => tag.trim().replace(/^#+/, "").toLowerCase() === token));
    const genreOk = c.ignoredFacet === "genre" || !c.genreTokens.length ||
      c.genreTokens.every((token) =>
        work.genres.some((genre) => genre.trim().toLowerCase() === token));
    const dateOk = c.order === "popular" ||
      (work.latestPostedAtValue >= c.start && work.latestPostedAtValue <= c.end);
    let savedOk = true;
    if (c.savedFilter) {
      savedOk = !c.unauthenticated &&
        (c.savedFilter === "followed-authors" || c.savedFilter === "liked-authors"
          ? !!work.authorId && savedAuthorIds.has(work.authorId)
          : savedSeriesIds.has(work.seriesId));
    }
    return tagOk && genreOk && dateOk && savedOk;
  }

  function facetCounts(items: SearchParityWork[], field: "tags" | "genres") {
    const counts = new Map<string, number>();
    for (const item of items) {
      const seen = new Set(item[field].map((v) => v.trim().replace(/^#+/, "").toLowerCase()));
      for (const token of seen) counts.set(token, (counts.get(token) ?? 0) + 1);
    }
    return [...counts].sort((a, b) => a[0].localeCompare(b[0]));
  }

  for (const c of cases) {
    const filteredByLanguage = works.filter((w) =>
      matchesPublicWorkLanguageFilters({ work: w, sourceLanguages: c.languages }));
    const evaluated = filteredByLanguage.map((work) => ({
      work, score: getPublicSearchMatchScore(c.query, work),
    }));
    const common = (work: SearchParityWork, score: number, ignoredFacet?: "tag" | "genre") =>
      matchesPublicSearchConditions({
        work, matchScore: score, selectedTagTokens: c.tagTokens,
        selectedGenreTokens: c.genreTokens, ignoredFacet, order: c.order,
        startAtValue: c.start, endAtValue: c.end, savedFilter: c.savedFilter,
        savedFilterRequiresLogin: c.unauthenticated, savedAuthorIds, savedSeriesIds,
      });

    for (const ignoredFacet of [undefined, "tag", "genre"] as const) {
      const actual = evaluated
        .filter(({ work, score }) => common(work, score, ignoredFacet))
        .map(({ work }) => work);
      const expected = evaluated
        .filter(({ work, score }) =>
          referenceMatches(work, { ...c, ignoredFacet }, score))
        .map(({ work }) => work);
      assert.deepEqual(
        actual.map((w) => w.seriesId),
        expected.map((w) => w.seriesId),
        `Search result identity/count must match canonical conditions (${c.query}, ${ignoredFacet ?? "results"})`
      );
      assert.deepEqual(facetCounts(actual, "tags"), facetCounts(expected, "tags"));
      assert.deepEqual(facetCounts(actual, "genres"), facetCounts(expected, "genres"));

      // Verify identical window identity/count, including out-of-range page
      // clamp, before moving any upstream candidate LIMIT to SQL.
      const actualPages = Math.max(1, Math.ceil(actual.length / PUBLIC_SEARCH_PAGE_SIZE));
      for (const request of [1, 2, 3, 41, 53, 999]) {
        const page = clampPublicSearchPage(request, actualPages);
        const start = (page - 1) * PUBLIC_SEARCH_PAGE_SIZE;
        assert.deepEqual(
          actual.slice(start, start + PUBLIC_SEARCH_PAGE_SIZE).map((w) => w.seriesId),
          expected.slice(start, start + PUBLIC_SEARCH_PAGE_SIZE).map((w) => w.seriesId)
        );
      }
    }
  }

  assert.equal(works.length > 1000, true);
  const firstPageSet = works.slice(0, 1000);
  assert.ok(
    firstPageSet.length < works.length,
    "a single default 1,000-row PostgREST page must never be treated as the full facet/search corpus"
  );
  assert.equal(
    works.slice((53 - 1) * PUBLIC_SEARCH_PAGE_SIZE, 53 * PUBLIC_SEARCH_PAGE_SIZE).length,
    9,
    "final 53rd page must remain reachable beyond a 1,000-row first-page fetch"
  );

  const source = readFileSync("src/app/search/SearchPageLegacy.tsx", "utf8");
  assert.ok(source.includes("matchesPublicSearchConditions({"));
  assert.ok(source.includes('matchesCurrentConditions(work, "tag")'));
  assert.ok(source.includes('matchesCurrentConditions(work, "genre")'));
  assert.ok(source.includes("const languageFacetWorks"));
  assert.ok(source.includes("const totalResultCount = sortedWorks.length"));
}

function verifyNormalizationAndMatching() {
  assert.equal(normalizePublicSearchText("ＡＬＩＣＥ　’S"), "alice s");
  assert.ok(getPublicSearchMatchScore("Alice's Adventures in Wonderland", alice) >= 900);
  assert.ok(getPublicSearchMatchScore("ALICE’S ADVENTURES IN WONDERLAND", alice) >= 900);
  assert.ok(getPublicSearchMatchScore("alice   adventures wonderland", alice) > 0);
  assert.ok(getPublicSearchMatchScore("Alices Adventres Wonderland", alice) > 0);
  assert.ok(getPublicSearchMatchScore("Lewis Carroll", alice) > 0);

  assert.ok(getPublicSearchMatchScore("文鳥", bunchou) > 0);
  assert.ok(getPublicSearchMatchScore("夏目　漱石 文鳥", bunchou) > 0);
  assert.ok(getPublicSearchMatchScore("어린왕자", korean) > 0);

  assert.equal(
    getPublicSearchMatchScore("アリスインワンダーランド", alice),
    0,
    "cross-script aliases must not be invented without source metadata"
  );

  assert.equal(
    clampPublicSearchQuery("x".repeat(PUBLIC_SEARCH_QUERY_MAX_LENGTH + 20)).length,
    PUBLIC_SEARCH_QUERY_MAX_LENGTH
  );
}

function verifyPagination() {
  assert.equal(PUBLIC_SEARCH_PAGE_SIZE, 24);
  assert.equal(parsePublicSearchPage(undefined), 1);
  assert.equal(parsePublicSearchPage("abc"), 1);
  assert.equal(parsePublicSearchPage("-4"), 1);
  assert.equal(parsePublicSearchPage("2.9"), 2);
  assert.equal(clampPublicSearchPage(999, 4), 4);
  assert.deepEqual(buildPublicSearchPaginationItems(1, 4), [1, 2, 3, 4]);
  assert.deepEqual(
    buildPublicSearchPaginationItems(5, 20),
    [1, "ellipsis", 4, 5, 6, "ellipsis", 20]
  );

  assert.equal(
    buildPublicSearchHref({
      q: "alice",
      selectedGenres: ["Fantasy"],
      sourceLanguages: ["en"],
      page: 2,
    }),
    "/search?q=alice&genres=Fantasy&source_language=en&page=2"
  );
  assert.equal(
    buildPublicSearchHref({
      q: "alice",
      selectedGenres: ["Fantasy"],
      sourceLanguages: ["en"],
    }),
    "/search?q=alice&genres=Fantasy&source_language=en",
    "filter changes omit page and therefore reset to page 1"
  );
}

function verifySourceContracts() {
  const controls = readFileSync("src/components/search/PublicSearchControls.tsx", "utf8");
  const languageHandlerStart = controls.indexOf(
    "onSourceLanguagesChange={(nextLanguages)"
  );
  assert.ok(languageHandlerStart >= 0);
  const languageHandler = controls.slice(
    languageHandlerStart,
    languageHandlerStart + 420
  );
  assert.equal(
    languageHandler.includes('"results"'),
    false,
    "language chip changes must not auto-scroll to results"
  );
  const searchHandler = controls.slice(
    controls.indexOf("function handleSearch"),
    controls.indexOf("function handleClear")
  );
  const genreHandler = controls.slice(
    controls.indexOf("function handleGenreToggle"),
    controls.indexOf("function handleTagToggle")
  );
  const tagHandler = controls.slice(
    controls.indexOf("function handleTagToggle"),
    controls.indexOf("const hasClearableConditions")
  );
  assert.ok(searchHandler.includes('"results"'), "explicit Search may scroll to results");
  assert.equal(genreHandler.includes('"results"'), false);
  assert.equal(tagHandler.includes('"results"'), false);

  const nav = readFileSync("src/components/search/SearchNavButton.tsx", "utf8");
  assert.ok(nav.includes("router.push(resolvedHref, { scroll: false })"));
  assert.equal(nav.includes('"read_language"'), false);

  const page = readFileSync("src/app/search/SearchPageLegacy.tsx", "utf8");
  assert.ok(page.includes('ignoredFacet?: "tag" | "genre"'));
  assert.ok(page.includes('matchesCurrentConditions(work, "tag")'));
  assert.ok(page.includes('matchesCurrentConditions(work, "genre")'));
  assert.ok(page.includes("const languageFacetWorks"));
  assert.ok(page.includes("buildLanguageCounts(languageFacetWorks)"));
  assert.ok(page.includes("const paginatedWorks = sortedWorks.slice"));
  assert.ok(page.includes('href="#search-filters"'));
  assert.ok(page.includes('aria-current="page"'));
  assert.ok(page.includes("PUBLIC_SEARCH_PAGE_SIZE"));
  assert.ok(page.includes("const totalResultCount = sortedWorks.length"));
  assert.equal(page.includes("TOPへ戻る"), false);
  assert.equal(page.includes("トップの一覧へ戻る"), false);

  const localeCopy = readFileSync("src/lib/search/searchLocaleCopy.ts", "utf8");
  assert.ok(localeCopy.includes('"検索条件へ戻る": "Back to filters"'));
  assert.ok(localeCopy.includes('"検索条件へ戻る": "검색 조건으로 돌아가기"'));

  const publicWorks = readFileSync("src/lib/publicWorks.ts", "utf8");
  assert.ok(publicWorks.includes("originalTitle: publicDomain?.originalTitle ?? null"));
  assert.ok(publicWorks.includes("ignorePublicSearchLanguageFilter?: boolean"));

  assert.equal(page.includes("viewCount={"), false);
  assert.equal(page.includes("likeCount={"), false);
  assert.equal(page.includes("bookmarkCount={"), false);
  assert.equal(page.includes("narrationPlayCount={"), false);
}

verifyNormalizationAndMatching();
verifyLargeSearchResultParity();
verifyPagination();
verifySourceContracts();

console.log(
  "PASS: Search normalization/fuzzy matching, pagination, scroll behavior, dynamic facet contracts and Child73 card constraints"
);
