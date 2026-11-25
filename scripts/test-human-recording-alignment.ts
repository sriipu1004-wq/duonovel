import assert from "node:assert/strict";
import { alignHumanRecordingToBodyOrThrow } from "../src/lib/recording/humanRecordingAlignment";
import type {
  HumanRecordingTranscriptionResult,
  HumanRecordingTranscriptionSegment,
  HumanRecordingTranscriptionWord,
} from "../src/lib/recording/humanRecordingTranscription";

// Characterization test: pins current behavior only (LT-002). Synthetic text and timings only.

function segment(id: number, start: number, end: number, text: string): HumanRecordingTranscriptionSegment {
  return { id, startTimeSeconds: start, endTimeSeconds: end, text };
}

function transcription(
  segments: HumanRecordingTranscriptionSegment[],
  words: HumanRecordingTranscriptionWord[] = []
): HumanRecordingTranscriptionResult {
  return { text: "", language: "ja", durationSeconds: 10, segments, words };
}

function timings(result: ReturnType<typeof alignHumanRecordingToBodyOrThrow>) {
  return result.manifest.sentenceTimings.map((timing) => [
    timing.sentenceIndex,
    timing.paragraphIndex,
    timing.chunkIndex,
    timing.timeSeconds,
    timing.durationSeconds,
    timing.timingSource,
    timing.matchConfidence,
    timing.targetText,
    timing.spokenText,
  ]);
}

const body = "吾輩は猫である。名前はまだ無い。\n\nどこで生れたかとんと見当がつかぬ。";
const oneSentencePerSegment = [
  segment(0, 0, 1.5, "吾輩は猫である。"),
  segment(1, 1.6, 3, "名前はまだ無い。"),
  segment(2, 3.2, 6, "どこで生れたかとんと見当がつかぬ。"),
];
const perfect = {
  totalSentenceCount: 3,
  matchedSentenceCount: 3,
  matchedSentenceRatio: 1,
  coveredCharacterRatio: 1,
  averageSimilarity: 1,
};

// Segment-level timings when no word timestamps are given.
const segmentOnly = alignHumanRecordingToBodyOrThrow({ body, transcription: transcription(oneSentencePerSegment) });
assert.deepEqual(segmentOnly.metrics, perfect);
assert.equal(segmentOnly.manifest.version, 1);
assert.deepEqual(timings(segmentOnly), [
  [0, 0, 0, 0, 1.5, "aligned_segment", 1, "吾輩は猫である。", "吾輩は猫である。"],
  [1, 0, 1, 1.6, 1.4, "aligned_segment", 1, "名前はまだ無い。", "名前はまだ無い。"],
  [2, 1, 2, 3.2, 2.8, "aligned_segment", 1, "どこで生れたかとんと見当がつかぬ。", "どこで生れたかとんと見当がつかぬ。"],
]);

// Word timestamps narrow the timing (padding included).
const words: HumanRecordingTranscriptionWord[] = [
  { word: "吾輩は", startTimeSeconds: 0.1, endTimeSeconds: 0.5 },
  { word: "猫である。", startTimeSeconds: 0.5, endTimeSeconds: 1.2 },
  { word: "名前は", startTimeSeconds: 1.5, endTimeSeconds: 2 },
  { word: "まだ無い。", startTimeSeconds: 2, endTimeSeconds: 2.8 },
  { word: "どこで生れたか", startTimeSeconds: 3.3, endTimeSeconds: 4.5 },
  { word: "とんと見当がつかぬ。", startTimeSeconds: 4.5, endTimeSeconds: 5.9 },
];
const withWords = alignHumanRecordingToBodyOrThrow({
  body,
  transcription: transcription(
    [
      segment(0, 0, 1.4, "吾輩は猫である。"),
      segment(1, 1.4, 3, "名前はまだ無い。"),
      segment(2, 3.2, 6, "どこで生れたかとんと見当がつかぬ。"),
    ],
    words
  ),
});
assert.deepEqual(withWords.metrics, perfect);
assert.deepEqual(
  withWords.manifest.sentenceTimings.map((timing) => [timing.timeSeconds, timing.durationSeconds, timing.timingSource]),
  [
    [0.1, 1.1, "aligned_word"],
    [1.5, 1.3, "aligned_word"],
    [3.3, 2.6, "aligned_word"],
  ]
);

// Ruby notation in the body is compared by its base text.
const ruby = alignHumanRecordingToBodyOrThrow({
  body: "吾輩《わがはい》は猫である。名前はまだ無い。",
  transcription: transcription(oneSentencePerSegment.slice(0, 2)),
});
assert.equal(ruby.metrics.matchedSentenceCount, 2);

// Errors.
assert.throws(
  () => alignHumanRecordingToBodyOrThrow({ body: "", transcription: transcription(oneSentencePerSegment) }),
  /^Error: episode_body_empty$/
);
assert.throws(
  () => alignHumanRecordingToBodyOrThrow({ body, transcription: transcription([segment(0, 0, 1, "  "), segment(1, 2, 1, "逆")]) }),
  /^Error: human_transcription_empty$/
);
assert.throws(
  () => alignHumanRecordingToBodyOrThrow({ body, transcription: transcription([segment(0, 0, 1, "全然関係のない話をしています")]) }),
  /human_alignment_insufficient:\{"totalSentenceCount":3,"matchedSentenceCount":0/
);

console.log("PASS: human recording alignment (segment/word timings, ruby, error codes)");
