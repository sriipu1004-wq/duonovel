import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  OpenAITranslationError,
  type OpenAITranslationSourceSegment,
} from "../src/lib/translation/openAITranslation";
import {
  PUBLIC_TRANSLATION_MAX_BATCH_SEGMENTS,
  PUBLIC_TRANSLATION_MAX_BATCH_SOURCE_CHARS,
  splitPublicTranslationBatches,
  validatePublicTranslationOutput,
} from "../src/lib/translation/publicEpisodeTranslation";
import {
  segmentSourceDocument,
} from "../src/lib/translation/segmentSourceDocument";

// Public-domain fixture from Natsume Soseki's Meian, the production classic
// that retained a failed EN translation row from 2026-08-21.
const MEIAN_FIXTURE = [
  "医者は探《さぐ》りを入れた後《あと》で、手術台の上から津田《つだ》を下《おろ》した。",
  "「やっぱり穴が腸まで続いているんでした。」",
  "津田は無言のまま帯を締《し》め直した。",
].join("\n\n");

function testClassicNormalization() {
  const document = segmentSourceDocument(MEIAN_FIXTURE, "ja");
  assert.ok(document.segments.length >= 3);

  const first = document.segments[0]!;
  assert.ok(
    first.sourceText.includes("探《さぐ》り"),
    "reader/source text must preserve the original ruby markup"
  );
  assert.ok(
    first.translationInput.includes("探（読み：さぐ）り"),
    "translation input may normalize recognized ruby markup"
  );
  assert.equal(
    first.sourceText.includes("（読み：さぐ）"),
    false,
    "translation-only normalization must not mutate stored/display source text"
  );
}

function testClassicResponseParsing() {
  const source = segmentSourceDocument(MEIAN_FIXTURE, "ja");
  const requestSegments: OpenAITranslationSourceSegment[] = source.segments.map(
    (segment) => ({
      id: segment.id,
      text: segment.translationInput,
    })
  );

  const translations = Object.fromEntries(
    requestSegments.map((segment, index) => [
      segment.id,
      [
        "After examining him, the doctor helped Tsuda down from the operating table.",
        "It turns out the opening continues all the way to the intestine.",
        "Tsuda silently retied his sash.",
      ][index] ?? `Translated sentence ${index + 1}`,
    ])
  );

  const valid = validatePublicTranslationOutput({
    text: JSON.stringify({
      translations,
      glossary_candidates: [],
    }),
    segments: requestSegments,
    sourceLanguage: "ja",
    targetLanguage: "en",
  });
  assert.equal(valid.segments.length, requestSegments.length);
  assert.ok(valid.segments.every((item) => item.trim().length > 0));

  const firstId = requestSegments[0]!.id;
  const invalidTranslations = {
    ...translations,
    [firstId]: "",
  };

  assert.throws(
    () =>
      validatePublicTranslationOutput({
        text: JSON.stringify({
          translations: invalidTranslations,
          glossary_candidates: [],
        }),
        segments: requestSegments,
        sourceLanguage: "ja",
        targetLanguage: "en",
      }),
    (error: unknown) =>
      error instanceof OpenAITranslationError &&
      /内容のない文/.test(error.message),
    "the historical empty-segment failure must be caught deterministically"
  );
}

function testClassicBatching() {
  const source = segmentSourceDocument(MEIAN_FIXTURE, "ja");
  const seed = source.segments[0]!;
  const longClassic: OpenAITranslationSourceSegment[] = Array.from(
    { length: 190 },
    (_, index) => ({
      id: `classic-${String(index).padStart(3, "0")}`,
      text: `${seed.translationInput} ${index}`,
    })
  );

  const batches = splitPublicTranslationBatches(longClassic);
  assert.ok(
    batches.length >= 2,
    "classic-sized episodes must not be sent as one structured-output request"
  );

  for (const batch of batches) {
    assert.ok(
      batch.length <= PUBLIC_TRANSLATION_MAX_BATCH_SEGMENTS,
      "each public translation batch must stay under the segment cap"
    );
    const chars = batch.reduce((sum, segment) => sum + segment.text.length, 0);
    assert.ok(
      chars <= PUBLIC_TRANSLATION_MAX_BATCH_SOURCE_CHARS ||
        batch.length === 1,
      "each multi-segment public translation batch must stay under the source-char cap"
    );
  }

  assert.deepEqual(
    batches.flat().map((segment) => segment.id),
    longClassic.map((segment) => segment.id),
    "batching must preserve source segment identity and order"
  );
}

function testFailureDoesNotConsumeReservation() {
  const source = readFileSync(
    "src/lib/translation/executeEpisodeTranslationGeneration.ts",
    "utf8"
  );
  const failureIndex = source.lastIndexOf("await markFailed({");
  const returnIndex = source.indexOf("return NextResponse.json(", failureIndex);
  const failureBlock = source.slice(failureIndex, returnIndex);
  assert.ok(
    failureBlock.includes("uncount: true"),
    "failed translation logs must be uncounted"
  );
  assert.ok(
    failureBlock.includes("await releaseActionReservation();"),
    "failed generation must release the reserved AI action"
  );
}

function main() {
  testClassicNormalization();
  testClassicResponseParsing();
  testClassicBatching();
  testFailureDoesNotConsumeReservation();
  console.log(
    "PASS: public classic normalization, structured response parsing, bounded batching, and failure reservation release"
  );
}

main();
