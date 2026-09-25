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
verifyPagination();
verifySourceContracts();

console.log(
  "PASS: Search normalization/fuzzy matching, pagination, scroll behavior, dynamic facet contracts and Child73 card constraints"
);
