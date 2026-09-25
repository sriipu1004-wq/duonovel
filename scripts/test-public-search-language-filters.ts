import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { parseHTML } from "linkedom";
import PublicSearchLanguageFilters from "../src/components/search/PublicSearchLanguageFilters";
import { buildPublicSearchHref } from "../src/components/search/PublicSearchControls";
import {
  getLocalizedSavedFilterLabel,
  localizeLegacySearchText,
  publicSearchControlCopy,
} from "../src/lib/search/searchLocaleCopy";
import { preservePublicSearchLanguageFilters } from "../src/lib/search/publicSearchLanguageHref";
import {
  matchesPublicWorkLanguageFilters,
  parsePublicSearchSourceLanguages,
} from "../src/lib/search/publicWorkLanguageFilter";
import type { SupportedLanguageTag } from "../src/lib/translation/languageRegistry";

type Work = Parameters<typeof matchesPublicWorkLanguageFilters>[0]["work"];

const ja: Work = { sourceLanguage: "ja" };
const en: Work = { sourceLanguage: "en" };
const ko: Work = { sourceLanguage: "ko" };
const unresolved: Work = { sourceLanguage: null };
const works = [ja, en, ko, unresolved];

function match(work: Work, sourceLanguages: SupportedLanguageTag[]) {
  return matchesPublicWorkLanguageFilters({ work, sourceLanguages });
}

async function verifyLanguageControlsAreMultiSelect() {
  const { window } = parseHTML("<html><body><div id='app'></div></body></html>");
  Object.assign(globalThis, {
    window,
    document: window.document,
    HTMLElement: window.HTMLElement,
    Event: window.Event,
    IS_REACT_ACT_ENVIRONMENT: true,
    fetch: async () =>
      new Response(
        JSON.stringify({
          ok: true,
          counts: { ja: 40, en: 3, ko: 2, fr: 0, de: 0, es: 0, "zh-Hans": 0, "zh-Hant": 0 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      ),
  });

  const host = document.getElementById("app")!;
  const root = createRoot(host);

  function Probe() {
    const [languages, setLanguages] = useState<SupportedLanguageTag[]>([]);
    return React.createElement(PublicSearchLanguageFilters, {
      sourceLanguages: languages,
      countsOverride: {
        ja: 40,
        en: 3,
        ko: 2,
        fr: 0,
        de: 0,
        es: 0,
        "zh-Hans": 0,
        "zh-Hant": 0,
      },
      onSourceLanguagesChange: setLanguages,
    });
  }

  await act(async () => {
    root.render(React.createElement(Probe));
    await Promise.resolve();
  });

  assert.equal(host.querySelectorAll("select").length, 0, "read-language selects must be removed");

  const buttons = Array.from(host.querySelectorAll<HTMLButtonElement>("button"));
  const japanese = buttons.find((button) => button.textContent?.includes("日本語"));
  const english = buttons.find((button) => button.textContent?.includes("English"));

  assert.ok(japanese, "Japanese source-language button must render");
  assert.ok(english, "English source-language button must render");

  await act(async () => {
    japanese.dispatchEvent(new window.Event("click", { bubbles: true }));
  });
  await act(async () => {
    english.dispatchEvent(new window.Event("click", { bubbles: true }));
  });

  assert.equal(japanese.getAttribute("aria-pressed"), "true");
  assert.equal(english.getAttribute("aria-pressed"), "true");

  await act(async () => root.unmount());
}

function verifySearchLocaleCopy() {
  assert.equal(publicSearchControlCopy.en.title, "Explore public works");
  assert.equal(publicSearchControlCopy.ko.search, "검색");
  assert.equal(
    getLocalizedSavedFilterLabel("bookmarked-works", "en"),
    "Bookmarked works"
  );
  assert.equal(localizeLegacySearchText("検索結果", "en"), "Search results");
  assert.equal(
    localizeLegacySearchText("条件に合う公開作品がない。", "ko"),
    "조건에 맞는 공개 작품이 없습니다."
  );

  const controlsSource = readFileSync(
    "src/components/search/PublicSearchControls.tsx",
    "utf8"
  );
  assert.ok(controlsSource.includes("sourceLanguages"));
  assert.equal(controlsSource.includes("readLanguage"), false);
  assert.equal(controlsSource.includes("read_language"), false);
  const tagIndex = controlsSource.indexOf('{copy.tag}');
  const languageIndex = controlsSource.indexOf('<PublicSearchLanguageFilters');
  assert.ok(tagIndex >= 0 && languageIndex > tagIndex, "source-language filters must render below tags");

  const languageSource = readFileSync(
    "src/components/search/PublicSearchLanguageFilters.tsx",
    "utf8"
  );
  assert.ok(languageSource.includes('max-h-[64px]'), "language chips must collapse to two rows");
  assert.ok(languageSource.includes('showMore: "続きを表示"'));
  assert.ok(languageSource.includes('px-2.5 py-1.5 text-xs'), "language chips must match tag/genre sizing");

  const cardSource = readFileSync(
    "src/components/public/PublicWorkBoardCard.tsx",
    "utf8"
  );
  assert.ok(cardSource.includes("basis-full whitespace-normal break-words"));
  assert.equal(cardSource.includes("max-w-full truncate text-base font-semibold"), false);

  const legacySearchSource = readFileSync(
    "src/app/search/SearchPageLegacy.tsx",
    "utf8"
  );
  assert.equal(legacySearchSource.includes("期間閲覧 {metrics.viewCount}"), false);
  assert.equal(legacySearchSource.includes("viewCount={work.viewCount}"), false);
  assert.equal(legacySearchSource.includes("likeCount={work.likeCount}"), false);

  const publicWorksSource = readFileSync("src/lib/publicWorks.ts", "utf8");
  assert.ok(publicWorksSource.includes('["public-base-work-cards-v10-narrow-series"]'));
  assert.equal(publicWorksSource.includes(".limit(120)"), false);
  assert.ok(publicWorksSource.includes(".range(start, start + PAGE_SIZE - 1)"));
  assert.ok(publicWorksSource.includes('.order("series_id", { ascending: true })'));

  const pageSource = readFileSync("src/app/search/page.tsx", "utf8");
  assert.ok(pageSource.includes("parsePublicSearchSourceLanguages"));
  assert.equal(pageSource.includes("PublicSearchReadIntentProvider"), false);
  assert.equal(pageSource.includes("parsePublicSearchReadLanguage"), false);
}

function verifyServerSearchLinksKeepOnlySourceLanguages() {
  assert.equal(
    preservePublicSearchLanguageFilters(
      "/search?q=detective&shelfTab=latest&read_language=ko",
      { sourceLanguages: ["ja", "en"] }
    ),
    "/search?q=detective&shelfTab=latest&source_language=ja%2Cen",
    "old read_language must be dropped while source-language selection is preserved"
  );

  assert.equal(
    preservePublicSearchLanguageFilters(
      "/search?source_language=ko&read_language=ko&order=updated",
      { sourceLanguages: ["ja", "en"] }
    ),
    "/search?source_language=ja%2Cen&order=updated",
    "current source-language set must override stale server-link values"
  );

  assert.equal(
    preservePublicSearchLanguageFilters(
      "/works/example",
      { sourceLanguages: ["ja", "en"] }
    ),
    "/works/example",
    "non-search links must not be mutated"
  );
}

async function main() {
  assert.deepEqual(parsePublicSearchSourceLanguages("ja,en"), ["ja", "en"]);
  assert.deepEqual(parsePublicSearchSourceLanguages("en,ja,en,invalid"), ["ja", "en"]);
  assert.deepEqual(parsePublicSearchSourceLanguages(undefined), []);

  assert.deepEqual(
    works.filter((work) => match(work, ["ja"])),
    [ja],
    "single source-language filter must match only that original language"
  );
  assert.deepEqual(
    works.filter((work) => match(work, ["ja", "en"])),
    [ja, en],
    "multi-select source languages use OR semantics"
  );
  assert.deepEqual(
    works.filter((work) => match(work, [])),
    works,
    "no source-language filter must preserve the existing result set"
  );

  assert.equal(
    buildPublicSearchHref({
      q: "detective",
      sourceLanguages: ["ja", "en"],
    }),
    "/search?q=detective&source_language=ja%2Cen"
  );

  verifySearchLocaleCopy();
  verifyServerSearchLinksKeepOnlySourceLanguages();
  await verifyLanguageControlsAreMultiSelect();

  console.log(
    "PASS: source-language multi-select, OR semantics, read_language compatibility, URL state and locale copy"
  );
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
