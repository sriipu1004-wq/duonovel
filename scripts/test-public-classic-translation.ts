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
  EPISODE_TRANSLATION_LIMITS,
  resolveEpisodeTranslationMaxSourceChars,
} from "../src/lib/translation/episodeTranslationGenerateLimits";
import {
  segmentSourceDocument,
  TRANSLATION_CLAUSE_SPLIT_MAX_LOOKAHEAD_CHARS,
} from "../src/lib/translation/segmentSourceDocument";
import {
  splitSentenceIntoDisplayClauses,
  READER_DISPLAY_CLAUSE_MAX_LOOKAHEAD_CHARS,
} from "../src/lib/recording/humanTimingShared";

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

function testLongClauseSegmentation() {
  const koreanLongSentence = [
    "C 여학교에서 교원 겸 기숙사 사감 노릇을 하는 B 여사라면 딱장대요 독신주의자요,",
    "찰진 야소꾼으로 유명하다 못해 학생들이 눈치를 살필 만큼 엄격하고 매서우며,",
    "여러 겹 주름이 잡힌 이마와 엉성하게 빗겨 넘긴 머리까지 한눈에 들어오고,",
    "그가 편지를 검사하는 순간에는 기숙생들이 숨을 죽일 만큼 긴장이 이어진다.",
  ].join(" ");

  const document = segmentSourceDocument(koreanLongSentence, "ko");
  assert.ok(
    document.segments.length >= 2,
    "a long comma-rich sentence must be split into readable clause blocks"
  );
  assert.ok(
    document.segments.every(
      (segment) =>
        segment.sourceText.length <= TRANSLATION_CLAUSE_SPLIT_MAX_LOOKAHEAD_CHARS ||
        !/[、,，;；:：]/u.test(segment.sourceText)
    ),
    "clause-rich blocks should stay bounded unless no safe punctuation exists"
  );
  assert.ok(
    document.segments.slice(0, -1).every((segment) => /[、,，;；:：]$/u.test(segment.sourceText)),
    "new boundaries must occur only after safe clause punctuation"
  );

  const shortSentence = "그는 웃고, 다시 걸었다.";
  assert.equal(
    segmentSourceDocument(shortSentence, "ko").segments.length,
    1,
    "short comma sentences must remain intact"
  );
}

function testReaderDisplayClauseSegmentation() {
  const longSentence = [
    "C 여학교에서 교원 겸 기숙사 사감 노릇을 하는 B 여사라면 딱장대요 독신주의자요,",
    "찰진 야소꾼으로 유명하고 학생들이 눈치를 살필 만큼 엄격하고 매서우며,",
    "여러 겹 주름이 잡힌 이마와 엉성하게 빗겨 넘긴 머리까지 한눈에 들어오고,",
    "편지를 검사하는 순간에는 기숙생들이 숨을 죽일 만큼 긴장이 이어진다.",
  ].join(" ");

  const clauses = splitSentenceIntoDisplayClauses(longSentence);
  assert.ok(clauses.length >= 2, "Reader must split long comma-rich sentences");
  assert.ok(
    clauses.every(
      (clause) =>
        clause.length <= READER_DISPLAY_CLAUSE_MAX_LOOKAHEAD_CHARS ||
        !/[、,，;；:：]/u.test(clause)
    ),
    "Reader display clauses must stay bounded when a safe boundary exists"
  );
  assert.equal(
    splitSentenceIntoDisplayClauses("그는 웃고, 다시 걸었다.").length,
    1,
    "Reader must not fragment short sentences"
  );

  const periodRich = [
    "첫 문장은 충분히 길어서 화면에서 한 덩어리로 보이면 읽기 어렵지만 문장 끝에는 마침표가 있다.",
    "둘째 문장 역시 길이를 충분히 확보해서 기존 추적 좌표를 바꾸지 않고 표시 블록만 안전하게 나누어야 한다.",
    "셋째 문장도 같은 방식으로 이어지며 약어 A.B처럼 글자 바로 뒤에 붙은 점은 경계로 오인하지 않아야 한다.",
  ].join(" ");
  const periodClauses = splitSentenceIntoDisplayClauses(periodRich);
  assert.ok(
    periodClauses.length >= 2,
    "Reader must recognize safe ASCII period boundaries"
  );
  assert.ok(
    periodClauses.every((part) => part.trim() !== "A."),
    "Reader must not split a period that is immediately followed by a letter"
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

function testVerifiedPublicDomainLongSourceLimit() {
  const ordinaryLimit = resolveEpisodeTranslationMaxSourceChars({
    verifiedPublicDomain: false,
  });
  const publicDomainLimit = resolveEpisodeTranslationMaxSourceChars({
    verifiedPublicDomain: true,
  });

  assert.equal(
    ordinaryLimit,
    EPISODE_TRANSLATION_LIMITS.maxSourceChars,
    "ordinary works must retain the global source-char guard"
  );
  assert.ok(
    publicDomainLimit >= 40_000,
    "rights-checked Public Domain works must support the 31.5k-character pilot"
  );
  assert.ok(
    publicDomainLimit > ordinaryLimit,
    "the Public Domain allowance must not silently expand the ordinary-work limit"
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
  testLongClauseSegmentation();
  testReaderDisplayClauseSegmentation();
  testVerifiedPublicDomainLongSourceLimit();
  testFailureDoesNotConsumeReservation();
  console.log(
    "PASS: public classic normalization, structured response parsing, bounded batching, verified Public Domain long-source limit, and failure reservation release"
  );
}

main();
