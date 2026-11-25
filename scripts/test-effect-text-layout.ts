import assert from "node:assert/strict";
import type { EffectIllustration, EffectSceneCue } from "../src/lib/effects/effectSettings";
import {
  buildContentBlocks,
  buildParagraphBlocks,
  buildSceneBreakRuntimeList,
  buildSceneCueRuntimeList,
  buildSentenceTimestampRuntimeList,
  resolveActiveSentenceIndex,
  resolveSentenceIndexByTargetText,
  splitParagraphIntoSentences,
} from "../src/lib/effects/effectTextLayout";

// Characterization test: pins current behavior only (LT-002).

assert.deepEqual(splitParagraphIntoSentences("  "), []);
assert.deepEqual(splitParagraphIntoSentences("。"), ["。"]);
assert.deepEqual(splitParagraphIntoSentences("a?b"), ["a?", "b"]);

const body = "吾輩《わがはい》は猫である。名前はまだ無い！\n\nどこで生れたか、とんと見当がつかぬ\n第一章";
const blocks = buildParagraphBlocks(body);
assert.deepEqual(blocks, [
  {
    paragraphIndex: 0,
    segments: [
      { index: 0, text: "吾輩《わがはい》は猫である。" },
      { index: 1, text: "名前はまだ無い！" },
    ],
  },
  { paragraphIndex: 1, segments: [{ index: 2, text: "どこで生れたか、とんと見当がつかぬ" }] },
  { paragraphIndex: 2, segments: [{ index: 3, text: "第一章" }] },
]);

// Loose matching (ruby reading and base text both count; minimum score 0.12).
assert.equal(resolveSentenceIndexByTargetText(blocks, "わがはいは猫である"), 0);
assert.equal(resolveSentenceIndexByTargetText(blocks, "名前"), 1);
assert.equal(resolveSentenceIndexByTargetText(blocks, "見当がつかぬ"), 2);
assert.equal(resolveSentenceIndexByTargetText(blocks, "第一章"), 3);
assert.equal(resolveSentenceIndexByTargetText(blocks, ""), null);
assert.equal(resolveSentenceIndexByTargetText(blocks, "x"), null);

function cue(id: string, triggerText: string): EffectSceneCue {
  return {
    id,
    label: "L",
    triggerText,
    nextBgmTrackId: null,
    nextBgmTitle: null,
    nextBgmAudioPath: null,
    backgroundPreset: null,
    textAnimation: null,
  };
}
// A short trigger in a long sentence falls below the 0.12 score and is dropped (current behavior).
assert.deepEqual(
  buildSceneCueRuntimeList(blocks, [cue("c1", "見当"), cue("c0", "吾輩"), cue("cx", "")]).map((item) => [item.id, item.sentenceIndex]),
  [["c0", 0]]
);

function illustration(overrides: Partial<EffectIllustration>): EffectIllustration {
  return {
    id: "i",
    imageUrl: "/a.png",
    caption: "",
    placement: "scene_break",
    anchorText: null,
    sentenceIndex: null,
    ...overrides,
  };
}
const sceneBreaks = buildSceneBreakRuntimeList(blocks, [
  illustration({ id: "a", sentenceIndex: 99 }), // clamped to last sentence
  illustration({ id: "b", anchorText: "名前はまだ無い" }),
  illustration({ id: "c", placement: "top", sentenceIndex: 0 }), // not a scene break
  illustration({ id: "d" }), // no anchor
]);
assert.deepEqual(sceneBreaks.map((item) => [item.id, item.sentenceIndex]), [
  ["b", 1],
  ["a", 3],
]);

assert.deepEqual(
  buildContentBlocks(blocks, sceneBreaks).map((block) =>
    block.kind === "paragraph"
      ? [block.key, block.sentences.map((sentence) => sentence.index)]
      : [block.key, block.afterSentenceIndex, block.illustrations.map((item) => item.id)]
  ),
  [
    ["paragraph-0-0", [0, 1]],
    ["scene-break-0-1", 1, ["b"]],
    ["paragraph-1-0", [2]],
    ["paragraph-2-0", [3]],
    ["scene-break-2-3", 3, ["a"]],
  ]
);

// Timestamps: sorted by time, matched forward and conservatively; negative times dropped.
// "とんと見当がつかぬ" is only 9/17 of its sentence (below the 0.55 length ratio) and is dropped.
const timestamps = buildSentenceTimestampRuntimeList(blocks, [
  { id: "t2", targetText: "とんと見当がつかぬ", timeSeconds: 5 },
  { id: "t1", targetText: "名前はまだ無い", timeSeconds: 2 },
  { id: "t0", targetText: "吾輩は猫である", timeSeconds: 0 },
  { id: "tn", targetText: "x", timeSeconds: -1 },
]);
assert.deepEqual(timestamps.map((item) => [item.id, item.sentenceIndex, item.timeSeconds]), [
  ["t0", 0, 0],
  ["t1", 1, 2],
]);

function active(currentTime: number, overrides: Partial<Parameters<typeof resolveActiveSentenceIndex>[0]> = {}) {
  return resolveActiveSentenceIndex({
    currentTime,
    duration: 10,
    totalSentenceCount: 4,
    sentenceTimestamps: timestamps,
    ...overrides,
  });
}
assert.equal(active(-1), -1);
assert.equal(active(0), 0);
assert.equal(active(1.9), 0);
assert.equal(active(2), 1);
assert.equal(active(100), 1);
// Estimated fallback by elapsed ratio when there are no timestamps.
assert.equal(active(5, { sentenceTimestamps: [] }), 2);
assert.equal(active(10, { sentenceTimestamps: [] }), 3);
assert.equal(active(-3, { sentenceTimestamps: [] }), 0);
assert.equal(active(5, { sentenceTimestamps: [], disableEstimatedFallback: true }), -1);
assert.equal(active(5, { sentenceTimestamps: [], duration: 0 }), -1);
assert.equal(active(5, { sentenceTimestamps: [], totalSentenceCount: 0 }), -1);

console.log("PASS: effect text layout (sentences, loose/forward matching, scene breaks, content blocks, active sentence)");
