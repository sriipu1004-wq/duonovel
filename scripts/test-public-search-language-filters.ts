import assert from "node:assert/strict";
import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { parseHTML } from "linkedom";
import PublicSearchLanguageFilters from "../src/components/search/PublicSearchLanguageFilters";
import { buildPublicSearchHref } from "../src/components/search/PublicSearchControls";
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

  await verifyLanguageControlsKeepBothSelections();

  console.log(
    "PASS: public search source/read language semantics, controlled selections and no-filter compatibility"
  );
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
