import type {
  NemoGeneratedSentenceTiming,
  NemoTimingManifest,
} from "@/lib/recording/nemoTiming";
import {
  buildHumanAlignedSentenceList,
  normalizeComparableSentenceText,
  splitIntoTrackingSentenceUnits,
} from "@/lib/recording/humanTimingShared";
import type {
  HumanRecordingTranscriptionResult,
  HumanRecordingTranscriptionSegment,
  HumanRecordingTranscriptionWord,
} from "@/lib/recording/humanRecordingTranscription";

export type HumanRecordingAlignmentMetrics = {
  totalSentenceCount: number;
  matchedSentenceCount: number;
  matchedSentenceRatio: number;
  coveredCharacterRatio: number;
  averageSimilarity: number;
};

type CandidateMatch = {
  startSegmentIndex: number;
  endSegmentIndex: number;
  startTimeSeconds: number;
  endTimeSeconds: number;
  rawText: string;
  normalizedText: string;
  similarity: number;
};

type CandidateWordWindow = {
  startTimeSeconds: number;
  endTimeSeconds: number;
  rawText: string;
  normalizedText: string;
  similarity: number;
};

const MAX_START_OFFSET = 2;
const MAX_SEGMENTS_PER_SENTENCE = 4;
const MAX_WORDS_PER_WINDOW = 24;
const WORD_PADDING_SECONDS = 0.08;
const MIN_SPLIT_STEP_SECONDS = 0.001;

const INLINE_RUBY_WITH_PIPE_PATTERN =
  /｜([^《》\r\n]+)《([^《》\r\n]+)》/gu;

const INLINE_RUBY_PATTERN =
  /([一-龯々〆ヵヶ〓]+)《([^《》\r\n]+)》/gu;

function roundTiming(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function replaceRubyWithBaseText(text: string): string {
  return text
    .replace(INLINE_RUBY_WITH_PIPE_PATTERN, "$1")
    .replace(INLINE_RUBY_PATTERN, "$1");
}

function replaceRubyWithReadingText(text: string): string {
  return text
    .replace(INLINE_RUBY_WITH_PIPE_PATTERN, "$2")
    .replace(INLINE_RUBY_PATTERN, "$2");
}

function buildAlignmentComparableCandidates(text: string): string[] {
  return Array.from(
    new Set(
      [
        text,
        replaceRubyWithBaseText(text),
        replaceRubyWithReadingText(text),
      ]
        .map((value) => normalizeComparableSentenceText(value))
        .filter((value) => value.length > 0)
    )
  );
}

function buildCharacterBigrams(text: string): string[] {
  if (text.length <= 1) {
    return text ? [text] : [];
  }

  const result: string[] = [];

  for (let index = 0; index < text.length - 1; index += 1) {
    result.push(text.slice(index, index + 2));
  }

  return result;
}

function computeDiceCoefficient(left: string, right: string): number {
  if (!left || !right) {
    return 0;
  }

  if (left === right) {
    return 1;
  }

  const leftBigrams = buildCharacterBigrams(left);
  const rightBigrams = buildCharacterBigrams(right);

  if (leftBigrams.length === 0 || rightBigrams.length === 0) {
    return 0;
  }

  const rightCounts = new Map<string, number>();

  for (const bigram of rightBigrams) {
    rightCounts.set(bigram, (rightCounts.get(bigram) ?? 0) + 1);
  }

  let overlap = 0;

  for (const bigram of leftBigrams) {
    const count = rightCounts.get(bigram) ?? 0;

    if (count > 0) {
      overlap += 1;
      rightCounts.set(bigram, count - 1);
    }
  }

  return (2 * overlap) / (leftBigrams.length + rightBigrams.length);
}

function computeTextSimilarity(target: string, candidate: string): number {
  if (!target || !candidate) {
    return 0;
  }

  if (target === candidate) {
    return 1;
  }

  const shorterLength = Math.min(target.length, candidate.length);
  const longerLength = Math.max(target.length, candidate.length);

  const containment =
    target.includes(candidate) || candidate.includes(target)
      ? shorterLength / longerLength
      : 0;

  const dice = computeDiceCoefficient(target, candidate);

  return Math.max(containment, dice);
}

function computeBestCandidateSimilarity(
  targetCandidates: string[],
  candidateCandidates: string[]
): {
  similarity: number;
  normalizedText: string;
} {
  let bestSimilarity = 0;
  let bestNormalizedText = "";

  for (const target of targetCandidates) {
    for (const candidate of candidateCandidates) {
      const similarity = computeTextSimilarity(target, candidate);

      if (similarity > bestSimilarity) {
        bestSimilarity = similarity;
        bestNormalizedText = candidate;
      }
    }
  }

  return {
    similarity: bestSimilarity,
    normalizedText: bestNormalizedText,
  };
}

function getRequiredSimilarity(textLength: number): number {
  if (textLength <= 4) {
    return 0.78;
  }

  if (textLength <= 8) {
    return 0.72;
  }

  if (textLength <= 16) {
    return 0.64;
  }

  return 0.56;
}

function isLengthRatioPlausible(targetLength: number, candidateLength: number): boolean {
  if (targetLength <= 0 || candidateLength <= 0) {
    return false;
  }

  const ratio = candidateLength / targetLength;
  return ratio >= 0.55 && ratio <= 1.7;
}

function pickBestCandidateMatch(args: {
  segments: HumanRecordingTranscriptionSegment[];
  segmentCursor: number;
  sentenceCandidates: string[];
  sentenceNormalizedText: string;
}): CandidateMatch | null {
  const {
    segments,
    segmentCursor,
    sentenceCandidates,
    sentenceNormalizedText,
  } = args;

  if (
    sentenceCandidates.length === 0 ||
    !sentenceNormalizedText ||
    segmentCursor >= segments.length
  ) {
    return null;
  }

  let best: CandidateMatch | null = null;
  const maxStartIndex = Math.min(
    segments.length - 1,
    segmentCursor + MAX_START_OFFSET
  );

  for (
    let startIndex = segmentCursor;
    startIndex <= maxStartIndex;
    startIndex += 1
  ) {
    let rawText = "";

    const maxEndIndex = Math.min(
      segments.length - 1,
      startIndex + MAX_SEGMENTS_PER_SENTENCE - 1
    );

    for (let endIndex = startIndex; endIndex <= maxEndIndex; endIndex += 1) {
      rawText += segments[endIndex].text;

      const candidateCandidates = buildAlignmentComparableCandidates(rawText);
      if (candidateCandidates.length === 0) {
        continue;
      }

      const bestSimilarityResult = computeBestCandidateSimilarity(
        sentenceCandidates,
        candidateCandidates
      );

      const candidateLength = bestSimilarityResult.normalizedText.length;
      const targetLength = sentenceNormalizedText.length;

      if (!isLengthRatioPlausible(targetLength, candidateLength)) {
        continue;
      }

      if (!best || bestSimilarityResult.similarity > best.similarity) {
        best = {
          startSegmentIndex: startIndex,
          endSegmentIndex: endIndex,
          startTimeSeconds: segments[startIndex].startTimeSeconds,
          endTimeSeconds: segments[endIndex].endTimeSeconds,
          rawText,
          normalizedText: bestSimilarityResult.normalizedText,
          similarity: bestSimilarityResult.similarity,
        };
      }
    }
  }

  if (!best) {
    return null;
  }

  const requiredSimilarity = getRequiredSimilarity(sentenceNormalizedText.length);

  return best.similarity >= requiredSimilarity ? best : null;
}

function collectWordsWithinCandidateRange(args: {
  words: HumanRecordingTranscriptionWord[];
  startTimeSeconds: number;
  endTimeSeconds: number;
}): HumanRecordingTranscriptionWord[] {
  const { words, startTimeSeconds, endTimeSeconds } = args;

  return words.filter((word) => {
    const overlaps =
      word.endTimeSeconds >= startTimeSeconds - WORD_PADDING_SECONDS &&
      word.startTimeSeconds <= endTimeSeconds + WORD_PADDING_SECONDS;

    return overlaps && word.word.trim().length > 0;
  });
}

function pickBestWordWindow(args: {
  words: HumanRecordingTranscriptionWord[];
  sentenceCandidates: string[];
  sentenceNormalizedText: string;
  candidateSimilarity: number;
}): CandidateWordWindow | null {
  const {
    words,
    sentenceCandidates,
    sentenceNormalizedText,
    candidateSimilarity,
  } = args;

  if (
    !sentenceNormalizedText ||
    sentenceCandidates.length === 0 ||
    words.length === 0
  ) {
    return null;
  }

  let best: CandidateWordWindow | null = null;

  for (let startIndex = 0; startIndex < words.length; startIndex += 1) {
    let rawText = "";

    const maxEndIndex = Math.min(
      words.length - 1,
      startIndex + MAX_WORDS_PER_WINDOW - 1
    );

    for (let endIndex = startIndex; endIndex <= maxEndIndex; endIndex += 1) {
      rawText += words[endIndex].word;

      const candidateCandidates = buildAlignmentComparableCandidates(rawText);
      if (candidateCandidates.length === 0) {
        continue;
      }

      const bestSimilarityResult = computeBestCandidateSimilarity(
        sentenceCandidates,
        candidateCandidates
      );

      const candidateLength = bestSimilarityResult.normalizedText.length;
      const targetLength = sentenceNormalizedText.length;

      if (!isLengthRatioPlausible(targetLength, candidateLength)) {
        continue;
      }

      if (!best || bestSimilarityResult.similarity > best.similarity) {
        best = {
          startTimeSeconds: words[startIndex].startTimeSeconds,
          endTimeSeconds: words[endIndex].endTimeSeconds,
          rawText,
          normalizedText: bestSimilarityResult.normalizedText,
          similarity: bestSimilarityResult.similarity,
        };
      }
    }
  }

  if (!best) {
    return null;
  }

  return best.similarity >= Math.max(candidateSimilarity, 0.72) ? best : null;
}

function buildAlignmentMetrics(args: {
  totalSentenceCount: number;
  matchedSentenceCount: number;
  totalCharacterCount: number;
  coveredCharacterCount: number;
  accumulatedSimilarity: number;
}): HumanRecordingAlignmentMetrics {
  const {
    totalSentenceCount,
    matchedSentenceCount,
    totalCharacterCount,
    coveredCharacterCount,
    accumulatedSimilarity,
  } = args;

  return {
    totalSentenceCount,
    matchedSentenceCount,
    matchedSentenceRatio:
      totalSentenceCount > 0 ? matchedSentenceCount / totalSentenceCount : 0,
    coveredCharacterRatio:
      totalCharacterCount > 0 ? coveredCharacterCount / totalCharacterCount : 0,
    averageSimilarity:
      matchedSentenceCount > 0 ? accumulatedSimilarity / matchedSentenceCount : 0,
  };
}

function stripWhitespace(text: string): string {
  return text.replace(/\s+/gu, "");
}

/**
 * Returns a function mapping a character offset (in the whitespace-stripped
 * segment text) to a time in seconds. When the words inside the segment spell
 * exactly the same text, times are interpolated inside each word; otherwise
 * they are interpolated over the whole segment by character count.
 */
function buildSegmentCharacterClock(
  segment: HumanRecordingTranscriptionSegment,
  compactText: string,
  words: HumanRecordingTranscriptionWord[]
): (offset: number) => number {
  const totalLength = compactText.length;
  const segmentDuration = segment.endTimeSeconds - segment.startTimeSeconds;

  const proportionalClock = (offset: number) =>
    segment.startTimeSeconds +
    (totalLength > 0 ? (offset / totalLength) * segmentDuration : 0);

  const segmentWords = words.filter(
    (word) =>
      word.startTimeSeconds >= segment.startTimeSeconds - WORD_PADDING_SECONDS &&
      word.endTimeSeconds <= segment.endTimeSeconds + WORD_PADDING_SECONDS
  );

  const wordSpans: Array<{ start: number; end: number; length: number }> = [];
  let wordText = "";

  for (const word of segmentWords) {
    const compactWord = stripWhitespace(word.word);
    if (!compactWord) {
      continue;
    }
    wordText += compactWord;
    wordSpans.push({
      start: word.startTimeSeconds,
      end: word.endTimeSeconds,
      length: compactWord.length,
    });
  }

  if (wordSpans.length === 0 || wordText !== compactText) {
    return proportionalClock;
  }

  return (offset: number) => {
    let consumed = 0;

    for (const span of wordSpans) {
      if (offset <= consumed + span.length) {
        const within = (offset - consumed) / span.length;
        return span.start + within * (span.end - span.start);
      }
      consumed += span.length;
    }

    return wordSpans[wordSpans.length - 1].end;
  };
}

/**
 * KD-6: a transcription segment often holds two or more body sentences
 * (Whisper-style output). Split such segments at sentence boundaries, using
 * the same splitter as the body, so each sentence can be matched on its own.
 * Segments that hold a single sentence are returned unchanged.
 */
function splitSegmentsAtSentenceBoundaries(
  segments: HumanRecordingTranscriptionSegment[],
  words: HumanRecordingTranscriptionWord[]
): HumanRecordingTranscriptionSegment[] {
  return segments.flatMap((segment) => {
    // Keep each part's own spacing (English words stay separated); offsets
    // are measured on the whitespace-stripped text.
    const parts = splitIntoTrackingSentenceUnits(segment.text)
      .map((part) => part.trim())
      .filter((part) => stripWhitespace(part).length > 0);

    if (parts.length <= 1) {
      return [segment];
    }

    const compactText = stripWhitespace(segment.text);
    if (parts.map((part) => stripWhitespace(part)).join("") !== compactText) {
      return [segment];
    }

    const clock = buildSegmentCharacterClock(segment, compactText, words);
    const result: HumanRecordingTranscriptionSegment[] = [];
    let offset = 0;
    let previousStart = Number.NEGATIVE_INFINITY;

    for (const part of parts) {
      const startOffset = offset;
      offset += stripWhitespace(part).length;

      // A zero-length (or very short) segment would give every part the same
      // start time, and later parts would be dropped as non-increasing.
      // Keep starts strictly increasing with a minimum step.
      const startTimeSeconds = roundTiming(
        Math.max(clock(startOffset), previousStart + MIN_SPLIT_STEP_SECONDS)
      );
      const endTimeSeconds = roundTiming(
        Math.max(clock(offset), startTimeSeconds + MIN_SPLIT_STEP_SECONDS)
      );
      previousStart = startTimeSeconds;

      result.push({
        id: segment.id,
        startTimeSeconds,
        endTimeSeconds,
        text: part,
      });
    }

    return result;
  });
}

function assertAlignmentQualityOrThrow(
  metrics: HumanRecordingAlignmentMetrics
): void {
  const minimumMatchedCount = Math.max(
    2,
    Math.ceil(metrics.totalSentenceCount * 0.03)
  );

  if (metrics.matchedSentenceCount < minimumMatchedCount) {
    throw new Error(`human_alignment_insufficient:${JSON.stringify(metrics)}`);
  }

  if (metrics.matchedSentenceRatio < 0.03) {
    throw new Error(`human_alignment_insufficient:${JSON.stringify(metrics)}`);
  }

  if (metrics.coveredCharacterRatio < 0.03) {
    throw new Error(`human_alignment_insufficient:${JSON.stringify(metrics)}`);
  }

  if (metrics.averageSimilarity < 0.56) {
    throw new Error(`human_alignment_insufficient:${JSON.stringify(metrics)}`);
  }
}

export function alignHumanRecordingToBodyOrThrow({
  body,
  transcription,
}: {
  body: string;
  transcription: HumanRecordingTranscriptionResult;
}): {
  manifest: NemoTimingManifest;
  metrics: HumanRecordingAlignmentMetrics;
} {
  const sentences = buildHumanAlignedSentenceList(body)
    .filter((sentence) => sentence.normalizedText.length > 0)
    .map((sentence) => ({
      ...sentence,
      comparableCandidates: buildAlignmentComparableCandidates(sentence.text),
    }))
    .filter((sentence) => sentence.comparableCandidates.length > 0);

  if (sentences.length === 0) {
    throw new Error("episode_body_empty");
  }

  const validSegments = transcription.segments.filter(
    (segment) =>
      segment.text.trim().length > 0 &&
      Number.isFinite(segment.startTimeSeconds) &&
      Number.isFinite(segment.endTimeSeconds) &&
      segment.endTimeSeconds >= segment.startTimeSeconds
  );

  if (validSegments.length === 0) {
    throw new Error("human_transcription_empty");
  }

  const words = transcription.words.filter(
    (word) =>
      word.word.trim().length > 0 &&
      Number.isFinite(word.startTimeSeconds) &&
      Number.isFinite(word.endTimeSeconds) &&
      word.endTimeSeconds >= word.startTimeSeconds
  );

  const segments = splitSegmentsAtSentenceBoundaries(validSegments, words);

  let segmentCursor = 0;
  let lastMatchedTimeSeconds = -1;
  let matchedSentenceCount = 0;
  let coveredCharacterCount = 0;
  let accumulatedSimilarity = 0;

  const totalCharacterCount = sentences.reduce(
    (sum, sentence) => sum + sentence.normalizedText.length,
    0
  );

  const sentenceTimings: NemoGeneratedSentenceTiming[] = [];

  for (const sentence of sentences) {
    const candidate = pickBestCandidateMatch({
      segments,
      segmentCursor,
      sentenceCandidates: sentence.comparableCandidates,
      sentenceNormalizedText: sentence.normalizedText,
    });

    if (!candidate) {
      continue;
    }

    if (candidate.startTimeSeconds <= lastMatchedTimeSeconds) {
      continue;
    }

    const candidateWords = collectWordsWithinCandidateRange({
      words,
      startTimeSeconds: candidate.startTimeSeconds,
      endTimeSeconds: candidate.endTimeSeconds,
    });

    const pickedWordWindow = pickBestWordWindow({
      words: candidateWords,
      sentenceCandidates: sentence.comparableCandidates,
      sentenceNormalizedText: sentence.normalizedText,
      candidateSimilarity: candidate.similarity,
    });

    // If the word window would start at or before the previous match (e.g.
    // zero-length word timings), fall back to the segment timing instead of
    // dropping the sentence.
    const bestWordWindow =
      pickedWordWindow &&
      pickedWordWindow.startTimeSeconds > lastMatchedTimeSeconds
        ? pickedWordWindow
        : null;

    const matchedStartTimeSeconds =
      bestWordWindow?.startTimeSeconds ?? candidate.startTimeSeconds;
    const matchedEndTimeSeconds =
      bestWordWindow?.endTimeSeconds ?? candidate.endTimeSeconds;
    const matchedSimilarity =
      bestWordWindow?.similarity ?? candidate.similarity;
    const matchedRawText = bestWordWindow?.rawText ?? candidate.rawText;
    const timingSource =
      bestWordWindow ? "aligned_word" : "aligned_segment";

    if (matchedStartTimeSeconds <= lastMatchedTimeSeconds) {
      continue;
    }

    matchedSentenceCount += 1;
    coveredCharacterCount += sentence.normalizedText.length;
    accumulatedSimilarity += matchedSimilarity;
    lastMatchedTimeSeconds = matchedStartTimeSeconds;
    segmentCursor = candidate.endSegmentIndex + 1;

    sentenceTimings.push({
      sentenceIndex: sentence.sentenceIndex,
      paragraphIndex: sentence.paragraphIndex,
      chunkIndex: matchedSentenceCount - 1,
      timeSeconds: roundTiming(matchedStartTimeSeconds),
      durationSeconds: roundTiming(
        Math.max(matchedEndTimeSeconds - matchedStartTimeSeconds, 0.01)
      ),
      targetText: sentence.text,
      spokenText: matchedRawText,
      timingSource,
      matchConfidence: roundTiming(matchedSimilarity),
    });
  }

  const metrics = buildAlignmentMetrics({
    totalSentenceCount: sentences.length,
    matchedSentenceCount,
    totalCharacterCount,
    coveredCharacterCount,
    accumulatedSimilarity,
  });

  assertAlignmentQualityOrThrow(metrics);

  return {
    manifest: {
      version: 1,
      generatedAt: new Date().toISOString(),
      sentenceTimings,
    },
    metrics,
  };
}