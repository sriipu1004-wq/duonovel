import assert from "node:assert/strict";
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

function main() {
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

  console.log(
    "PASS: public search source/read language semantics, permission rules and no-filter compatibility"
  );
}

main();
