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

// KD-6 regression: one segment holding two body sentences is split at the
// sentence boundary before matching. Without word timestamps the time is
// divided by character count (吾輩は猫である。 = 8 chars, 名前はまだ無い。 = 8 chars).
const twoSentenceSegment = [
  segment(0, 0, 3, "吾輩は猫である。名前はまだ無い。"),
  segment(1, 3.2, 6, "どこで生れたかとんと見当がつかぬ。"),
];
const multi = alignHumanRecordingToBodyOrThrow({ body, transcription: transcription(twoSentenceSegment) });
assert.deepEqual(multi.metrics, perfect);
assert.deepEqual(timings(multi), [
  [0, 0, 0, 0, 1.5, "aligned_segment", 1, "吾輩は猫である。", "吾輩は猫である。"],
  [1, 0, 1, 1.5, 1.5, "aligned_segment", 1, "名前はまだ無い。", "名前はまだ無い。"],
  [2, 1, 2, 3.2, 2.8, "aligned_segment", 1, "どこで生れたかとんと見当がつかぬ。", "どこで生れたかとんと見当がつかぬ。"],
]);

// Whisper-style spacing between sentences does not prevent the split.
const spaced = alignHumanRecordingToBodyOrThrow({
  body,
  transcription: transcription([
    segment(0, 0, 3, " 吾輩は猫である。 名前はまだ無い。"),
    segment(1, 3.2, 6, "どこで生れたかとんと見当がつかぬ。"),
  ]),
});
assert.equal(spaced.metrics.matchedSentenceCount, 3);

// With word timestamps the split uses the word times.
const multiWithWords = alignHumanRecordingToBodyOrThrow({
  body,
  transcription: transcription(
    [
      segment(0, 0, 3, "吾輩は猫である。名前はまだ無い。"),
      segment(1, 3.2, 6, "どこで生れたかとんと見当がつかぬ。"),
    ],
    words
  ),
});
assert.deepEqual(multiWithWords.metrics, perfect);
assert.deepEqual(
  multiWithWords.manifest.sentenceTimings.map((timing) => [timing.timeSeconds, timing.durationSeconds, timing.timingSource]),
  [
    [0.1, 1.1, "aligned_word"],
    [1.5, 1.3, "aligned_word"],
    [3.3, 2.6, "aligned_word"],
  ]
);

// A word that straddles the sentence boundary is interpolated inside the word,
// so the second sentence still starts after the first.
const straddle = alignHumanRecordingToBodyOrThrow({
  body,
  transcription: transcription(
    [
      segment(0, 0, 3, "吾輩は猫である。名前はまだ無い。"),
      segment(1, 3.2, 6, "どこで生れたかとんと見当がつかぬ。"),
    ],
    [
      { word: "吾輩は猫で", startTimeSeconds: 0, endTimeSeconds: 1 },
      { word: "ある。名前", startTimeSeconds: 1, endTimeSeconds: 2 },
      { word: "はまだ無い。", startTimeSeconds: 2, endTimeSeconds: 3 },
    ]
  ),
});
assert.equal(straddle.metrics.matchedSentenceCount, 3);
assert.ok(straddle.manifest.sentenceTimings[1].timeSeconds > straddle.manifest.sentenceTimings[0].timeSeconds);

// Split parts keep their own spacing, so English words are not glued together.
const english = alignHumanRecordingToBodyOrThrow({
  body: "Is this a pen? Yes it is!\n\nThat is good.",
  transcription: transcription([
    segment(0, 0, 3, " Is this a pen? Yes it is!"),
    segment(1, 3.2, 5, " That is good."),
  ]),
});
assert.equal(english.metrics.matchedSentenceCount, 3);
assert.deepEqual(
  english.manifest.sentenceTimings.map((timing) => timing.spokenText),
  ["Is this a pen?", "Yes it is!", " That is good."]
);

// A zero-length segment holding two sentences: later parts get a minimum
// step instead of the same start time, so no sentence is dropped.
const zeroLength = alignHumanRecordingToBodyOrThrow({
  body,
  transcription: transcription([
    segment(0, 1, 1, "吾輩は猫である。名前はまだ無い。"),
    segment(1, 3.2, 6, "どこで生れたかとんと見当がつかぬ。"),
  ]),
});
assert.deepEqual(zeroLength.metrics, perfect);
assert.deepEqual(
  zeroLength.manifest.sentenceTimings.map((timing) => [timing.timeSeconds, timing.durationSeconds]),
  [
    [1, 0.01],
    [1.001, 0.01],
    [3.2, 2.8],
  ]
);

// Same with zero-length word timings: the word window would not advance, so
// the split segment timing is used instead of dropping the sentence.
const zeroLengthWords = alignHumanRecordingToBodyOrThrow({
  body,
  transcription: transcription(
    [
      segment(0, 1, 1, "吾輩は猫である。名前はまだ無い。"),
      segment(1, 3.2, 6, "どこで生れたかとんと見当がつかぬ。"),
    ],
    [
      { word: "吾輩は猫である。", startTimeSeconds: 1, endTimeSeconds: 1 },
      { word: "名前はまだ無い。", startTimeSeconds: 1, endTimeSeconds: 1 },
    ]
  ),
});
assert.equal(zeroLengthWords.metrics.matchedSentenceCount, 3);
assert.ok(zeroLengthWords.manifest.sentenceTimings[1].timeSeconds > zeroLengthWords.manifest.sentenceTimings[0].timeSeconds);

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

console.log("PASS: human recording alignment (segment/word timings, multi-sentence segments, ruby, error codes)");
