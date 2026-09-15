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
  parsePublicSearchReadLanguage,
  parsePublicSearchSourceLanguage,
} from "../src/lib/search/publicWorkLanguageFilter";

type Work = Parameters<typeof matchesPublicWorkLanguageFilters>[0]["work"];

const jaAllowed: Work = { sourceLanguage: "ja", translationEligible: true };
const jaClosed: Work = { sourceLanguage: "ja", translationEligible: false };
const enClosed: Work = { sourceLanguage: "en", translationEligible: false };
const koAllowed: Work = { sourceLanguage: "ko", translationEligible: true };
const koClosed: Work = { sourceLanguage: "ko", translationEligible: false };
const unresolvedLegacy: Work = { sourceLanguage: null, translationEligible: true };
const works = [jaAllowed, jaClosed, enClosed, koAllowed, koClosed];

function match(
  work: Work,
  sourceLanguage: ReturnType<typeof parsePublicSearchSourceLanguage>,
  readLanguage: ReturnType<typeof parsePublicSearchReadLanguage>
) {
  return matchesPublicWorkLanguageFilters({ work, sourceLanguage, readLanguage });
}

async function verifyLanguageControlsKeepBothSelections() {
  const { window } = parseHTML("<html><body><div id='app'></div></body></html>");
  Object.assign(globalThis, {
    window,
    document: window.document,
    HTMLElement: window.HTMLElement,
    Event: window.Event,
    IS_REACT_ACT_ENVIRONMENT: true,
  });

  const host = document.getElementById("app")!;
  const root = createRoot(host);

  function Probe() {
    const [sourceLanguage, setSourceLanguage] = useState<"ja" | null>(null);
    const [readLanguage, setReadLanguage] = useState<"en" | null>(null);

    return React.createElement(PublicSearchLanguageFilters, {
      sourceLanguage,
      readLanguage,
      onSourceLanguageChange: (value) =>
        setSourceLanguage(value === "ja" ? value : null),
      onReadLanguageChange: (value) =>
        setReadLanguage(value === "en" ? value : null),
    });
  }

  await act(async () => {
    root.render(React.createElement(Probe));
  });

  const [sourceSelect, readSelect] = Array.from(
    host.querySelectorAll<HTMLSelectElement>("select")
  );
  assert.ok(sourceSelect && readSelect, "both language selects must render");

  const sourceOption = sourceSelect.querySelector<HTMLOptionElement>(
    'option[value="ja"]'
  );
  assert.ok(sourceOption, "Japanese source option must render");
  sourceOption.selected = true;
  await act(async () => {
    sourceSelect.dispatchEvent(new window.Event("change", { bubbles: true }));
  });

  const readOption = readSelect.querySelector<HTMLOptionElement>(
    'option[value="en"]'
  );
  assert.ok(readOption, "English reading option must render");
  readOption.selected = true;
  await act(async () => {
    readSelect.dispatchEvent(new window.Event("change", { bubbles: true }));
  });

  assert.equal(sourceSelect.value, "ja");
  assert.equal(readSelect.value, "en");

  await act(async () => {
    root.unmount();
  });
}

function verifySearchLocaleCopy() {
  assert.equal(publicSearchControlCopy.en.title, "Explore public works");
  assert.equal(publicSearchControlCopy.ko.search, "검색");
  assert.equal(
    getLocalizedSavedFilterLabel("bookmarked-works", "en"),
    "Bookmarked works"
  );
  assert.equal(
    localizeLegacySearchText("検索結果", "en"),
    "Search results"
  );
  assert.equal(
    localizeLegacySearchText("条件に合う公開作品がない。", "ko"),
    "조건에 맞는 공개 작품이 없습니다."
  );
  assert.equal(
    localizeLegacySearchText("現在表示: 総合人気順", "en"),
    "Current shelf: Overall popularity"
  );
  assert.equal(
    localizeLegacySearchText(
      "指定期間: 2026-09-01 〜 2026-09-15 / 並び順: 更新順",
      "ko"
    ),
    "기간: 2026-09-01 〜 2026-09-15 / 정렬: 업데이트순"
  );

  const controlsSource = readFileSync(
    "src/components/search/PublicSearchControls.tsx",
    "utf8"
  );
  assert.ok(controlsSource.includes("useUiLocale"));
  assert.ok(controlsSource.includes("publicSearchControlCopy[locale]"));
  assert.ok(controlsSource.includes("localizePath("));
  assert.equal(
    controlsSource.includes("公開作品を探す"),
    false,
    "client search controls must not hardcode Japanese UI copy"
  );

  const pageSource = readFileSync("src/app/search/page.tsx", "utf8");
  assert.ok(pageSource.includes("getUiLocale"));
  assert.ok(pageSource.includes("localizeLegacySearchNode"));
  assert.ok(pageSource.includes("preservePublicSearchLanguageFilters"));
}

function verifyServerSearchLinksKeepLanguageFilters() {
  assert.equal(
    preservePublicSearchLanguageFilters(
      "/search?q=detective&shelfTab=latest",
      { sourceLanguage: "ja", readLanguage: "en" }
    ),
    "/search?q=detective&shelfTab=latest&source_language=ja&read_language=en"
  );
  assert.equal(
    preservePublicSearchLanguageFilters(
      "/search?source_language=ko&read_language=ko&order=updated",
      { sourceLanguage: "ja", readLanguage: "en" }
    ),
    "/search?source_language=ja&read_language=en&order=updated",
    "current request language filters must override stale server-link values"
  );
  assert.equal(
    preservePublicSearchLanguageFilters(
      "/works/example",
      { sourceLanguage: "ja", readLanguage: "en" }
    ),
    "/works/example",
    "non-search links must not be mutated"
  );
}

async function main() {
  assert.equal(parsePublicSearchSourceLanguage("ja"), "ja");
  assert.equal(parsePublicSearchSourceLanguage("en"), "en");
  assert.equal(parsePublicSearchSourceLanguage("ko"), "ko");
  assert.equal(parsePublicSearchSourceLanguage("invalid"), null);
  assert.equal(parsePublicSearchReadLanguage("fr"), "fr");
  assert.equal(parsePublicSearchReadLanguage("invalid"), null);

  assert.deepEqual(
    works.filter((work) => match(work, "ja", null)),
    [jaAllowed, jaClosed],
    "source=ja must return Japanese-source works only"
  );
  assert.deepEqual(
    works.filter((work) => match(work, "en", null)),
    [enClosed],
    "source=en must return English-source works only"
  );
  assert.deepEqual(
    works.filter((work) => match(work, "ko", null)),
    [koAllowed, koClosed],
    "source=ko must return Korean-source works only"
  );

  assert.equal(match(jaAllowed, "ja", "en"), true);
  assert.equal(match(jaClosed, "ja", "en"), false);
  assert.equal(
    match(jaClosed, "ja", "ja"),
    true,
    "same-language reading must not require translation permission"
  );

  assert.deepEqual(
    works.filter((work) => match(work, null, "en")),
    [jaAllowed, enClosed, koAllowed],
    "read=en must include English originals plus translation-eligible other-language works"
  );

  assert.equal(
    match(unresolvedLegacy, null, "en"),
    false,
    "unresolved legacy language must never be treated as Japanese or translation eligible by guess"
  );

  assert.deepEqual(
    works.filter((work) => match(work, null, null)),
    works,
    "no language filters must preserve the existing result set"
  );

  assert.equal(
    buildPublicSearchHref({
      q: "detective",
      sourceLanguage: "ja",
      readLanguage: "en",
    }),
    "/search?q=detective&source_language=ja&read_language=en",
    "a search submission must retain both independently chosen language filters"
  );

  verifySearchLocaleCopy();
  verifyServerSearchLinksKeepLanguageFilters();
  await verifyLanguageControlsKeepBothSelections();

  console.log(
    "PASS: public search source/read language semantics, locale copy, navigation state, controlled selections and no-filter compatibility"
  );
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
