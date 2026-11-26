import assert from "node:assert/strict";
import { buildNemoChunks } from "../src/lib/recording/nemoChunking";

// KD-9 regression: original and spoken sentences are 1:1, so preprocessing
// that merges sentences (」 -> 」、, ―― -> 、) can no longer duplicate text.
// Synthetic text only.

function rows(body: string) {
  return buildNemoChunks(body).map((chunk) => [
    chunk.text,
    chunk.pauseAfterMs,
    chunk.paragraphIndex,
    chunk.chunkIndex,
    chunk.sourceSentenceIndex,
    chunk.sourceSentenceText,
  ]);
}

function occurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

// Dialogue close followed by narration: no duplicated "と彼は言った。".
const dialogue = buildNemoChunks("「こんにちは」と彼は言った。");
assert.equal(occurrences(dialogue.map((chunk) => chunk.text).join(""), "と彼は言った"), 1);
assert.deepEqual(rows("「こんにちは」と彼は言った。"), [
  ["「こんにちは」", 320, 0, 0, 0, "「こんにちは」"],
  ["と彼は言った。", 920, 0, 1, 1, "と彼は言った。"],
]);

// Dash: spoken as "、" but still gets the dash pause, and no duplicated "彼は去った".
const dash = buildNemoChunks("そして――彼は去った");
assert.equal(occurrences(dash.map((chunk) => chunk.text).join(""), "彼は去った"), 1);
assert.deepEqual(rows("そして――彼は去った"), [
  ["そして、", 430, 0, 0, 0, "そして――"],
  ["彼は去った", 620, 0, 1, 1, "彼は去った"],
]);

// Unchanged behavior: ruby reading, classical kana, paragraph pauses, long-sentence split.
assert.deepEqual(
  rows(
    "吾輩《わがはい》は猫である。名前はまだ無い。\n\nどこで生れたかとんと見当がつかぬ。何でも薄暗いじめじめした所でニャーニャー泣いていた事だけは記憶している。"
  ),
  [
    ["わがはいは猫である。", 380, 0, 0, 0, "吾輩《わがはい》は猫である。"],
    ["名前はまだ無い。", 920, 0, 1, 1, "名前はまだ無い。"],
    ["どこで生れたかとんと見当がつかぬ。", 380, 1, 0, 2, "どこで生れたかとんと見当がつかぬ。"],
    [
      "何でも薄暗いじめじめした所でニャーニャー泣いていたことだけは記憶",
      220,
      1,
      1,
      3,
      "何でも薄暗いじめじめした所でニャーニャー泣いていた事だけは記憶している。",
    ],
    ["している。", 920, 1, 2, 3, "何でも薄暗いじめじめした所でニャーニャー泣いていた事だけは記憶している。"],
  ]
);
assert.deepEqual(rows("彼は……黙った。云ふまでもない。"), [
  ["彼は……", 520, 0, 0, 0, "彼は……"],
  ["黙った。", 380, 0, 1, 1, "黙った。"],
  ["いうまでもない。", 920, 0, 2, 2, "云ふまでもない。"],
]);

// Pronunciation dictionary still applies per sentence.
assert.deepEqual(
  buildNemoChunks("ACMEに行った。", { pronunciationDictionary: { ACME: "アクメ" } }).map((chunk) => chunk.text),
  ["アクメに行った。"]
);

// A dictionary entry that spans a sentence boundary still applies; the two
// original sentences become one chunk group, and the next sentence index
// skips both so it stays aligned with the Reader's sentence numbering.
assert.deepEqual(
  buildNemoChunks("「はい」と言った。次へ。", { pronunciationDictionary: { "「はい」と": "「はい」って" } }).map(
    (chunk) => [chunk.text, chunk.sourceSentenceIndex, chunk.sourceSentenceText]
  ),
  [
    ["「はい」、って言った。", 0, "「はい」と言った。"],
    ["次へ。", 2, "次へ。"],
  ]
);

// A ruby whose base text spans a sentence boundary (…… splits sentences) still
// resolves to its reading.
assert.deepEqual(
  buildNemoChunks("｜嗚呼……無情《ああむじょう》だ。").map((chunk) => [chunk.text, chunk.sourceSentenceIndex]),
  [["ああむじょうだ。", 0]]
);

assert.deepEqual(buildNemoChunks(""), []);

console.log("PASS: Nemo chunking (1:1 original/spoken sentences, no duplicated text, pauses)");
