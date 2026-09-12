import assert from "node:assert/strict";
import {
  applyReadingModeToHref,
  readReadingHistory,
  writeReadingHistory,
} from "../src/lib/playback/readingBookmark";
import {
  inferSeriesSourceLanguage,
  readCanonicalSeriesSourceLanguage,
  sourceLanguageToContentLanguage,
} from "../src/lib/translation/seriesSourceLanguage";

function installLocalStorage() {
  const values = new Map<string, string>();
  Object.assign(globalThis, {
    window: {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
      },
      dispatchEvent: () => true,
      location: { search: "" },
    },
    CustomEvent: class CustomEvent<T = unknown> {
      detail: T;
      constructor(_name: string, init?: { detail?: T }) {
        this.detail = init?.detail as T;
      }
    },
  });
}

function main() {
  installLocalStorage();

  const canonicalEnglish = {
    id: "work-en",
    title: "日本語のように見えるタイトル",
    source_language: "en",
  };
  assert.equal(
    readCanonicalSeriesSourceLanguage(canonicalEnglish),
    "en",
    "canonical source language must win over text heuristics"
  );
  assert.equal(
    inferSeriesSourceLanguage(canonicalEnglish, "これは日本語本文です。"),
    "en",
    "episode text must not override confirmed work source language"
  );

  const legacyKorean = {
    id: "legacy-ko",
    title: "한국어 작품",
    source_language: null,
  };
  assert.equal(
    inferSeriesSourceLanguage(legacyKorean, "그는 오래된 문을 열었다."),
    "ko",
    "legacy work may use the current detector until confirmed"
  );
  assert.equal(sourceLanguageToContentLanguage("ko"), "ko");
  assert.equal(sourceLanguageToContentLanguage("fr"), "other");

  writeReadingHistory({
    seriesId: "work",
    episodeNumber: 12,
    positionIndex: 25,
    paragraphIndex: 24,
    sentenceIndex: 1,
    mode: "translation",
    sourceLanguage: "ja",
    targetLanguage: "en",
  });
  const restored = readReadingHistory("work");
  assert.equal(restored?.mode, "translation");
  assert.equal(restored?.targetLanguage, "en");
  assert.equal(restored?.paragraphIndex, 24);
  assert.equal(restored?.sentenceIndex, 1);

  const translationHref = applyReadingModeToHref("/read/work/13", restored!);
  const translationUrl = new URL(translationHref, "https://libread.local");
  assert.equal(translationUrl.searchParams.get("readingMode"), "translation");
  assert.equal(translationUrl.searchParams.get("translationOnly"), "1");
  assert.equal(translationUrl.searchParams.get("bilingual"), null);
  assert.equal(translationUrl.searchParams.get("sourceLanguage"), "ja");
  assert.equal(translationUrl.searchParams.get("targetLanguage"), "en");
  assert.equal(translationUrl.searchParams.get("resumeParagraph"), "24");

  const bilingualHref = applyReadingModeToHref("/read/work/13", {
    ...restored!,
    mode: "bilingual",
    targetLanguage: "ko",
  });
  const bilingualUrl = new URL(bilingualHref, "https://libread.local");
  assert.equal(bilingualUrl.searchParams.get("bilingual"), "1");
  assert.equal(bilingualUrl.searchParams.get("translationOnly"), null);
  assert.equal(bilingualUrl.searchParams.get("targetLanguage"), "ko");

  const originalHref = applyReadingModeToHref("/read/work/13", {
    ...restored!,
    mode: "standard",
  });
  const originalUrl = new URL(originalHref, "https://libread.local");
  assert.equal(originalUrl.searchParams.get("readingMode"), "standard");
  assert.equal(originalUrl.searchParams.get("translationOnly"), null);
  assert.equal(originalUrl.searchParams.get("targetLanguage"), null);

  console.log(
    "PASS: canonical source language, legacy fallback, translation-only state and mode URLs"
  );
}

main();
