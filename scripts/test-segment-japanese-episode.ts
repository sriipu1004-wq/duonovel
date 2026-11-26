import assert from "node:assert/strict";
import {
  normalizeJapaneseForTranslation,
  normalizeTranslationSourceText,
  segmentJapaneseEpisode,
} from "../src/lib/translation/segmentJapaneseEpisode";
import {
  normalizeJapaneseForTranslation as normalizeJapaneseDirect,
  normalizeTranslationSourceText as normalizeSourceDirect,
  segmentSourceDocument,
} from "../src/lib/translation/segmentSourceDocument";

// Characterization test: pins current behavior only (LT-002).
// segmentJapaneseEpisode is a compatibility wrapper around segmentSourceDocument(body, "ja").

assert.equal(normalizeJapaneseForTranslation, normalizeJapaneseDirect);
assert.equal(normalizeTranslationSourceText, normalizeSourceDirect);

const bodies = [
  "",
  "吾輩は猫である。名前はまだ無い。",
  "「こんにちは」と彼は言った。\n\nどこで生れたか…とんと見当がつかぬ。",
  "一行目\r\n二行目\r\n\r\n三段落目",
];

for (const body of bodies) {
  assert.deepEqual(segmentJapaneseEpisode(body), segmentSourceDocument(body, "ja"), JSON.stringify(body));
}

console.log("PASS: segmentJapaneseEpisode wrapper equals segmentSourceDocument(body, \"ja\")");
