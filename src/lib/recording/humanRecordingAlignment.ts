import type {
  NemoGeneratedSentenceTiming,
  NemoTimingManifest,
} from "@/lib/recording/nemoTiming";
import {
  buildHumanAlignedSentenceList,
  normalizeComparableSentenceText,
} from "@/lib/recording/humanTimingShared";
import type {
  HumanRecordingTranscriptionResult,
  HumanRecordingTranscriptionSegment,
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

const MAX_START_OFFSET = 2;
const MAX_SEGMENTS_PER_SENTENCE = 4;

function roundTiming(value: number): number {
  return Math.round(value * 1000) / 1000;
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

function getRequiredSimilarity(textLength: number): number {
  if (textLength <= 4) {
    return 0.42;
  }

  if (textLength <= 8) {
    return 0.52;
  }

  if (textLength <= 16) {
    return 0.58;
  }

  return 0.63;
}

function pickBestCandidateMatch(args: {
  segments: HumanRecordingTranscriptionSegment[];
  segmentCursor: number;
  sentenceNormalizedText: string;
}): CandidateMatch | null {
  const { segments, segmentCursor, sentenceNormalizedText } = args;

  if (!sentenceNormalizedText || segmentCursor >= segments.length) {
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
    let normalizedText = "";

    const maxEndIndex = Math.min(
      segments.length - 1,
      startIndex + MAX_SEGMENTS_PER_SENTENCE - 1
    );

    for (let endIndex = startIndex; endIndex <= maxEndIndex; endIndex += 1) {
      rawText += segments[endIndex].text;
      normalizedText += normalizeComparableSentenceText(segments[endIndex].text);

      if (!normalizedText) {
        continue;
      }

      const similarity = computeTextSimilarity(
        sentenceNormalizedText,
        normalizedText
      );

      if (!best || similarity > best.similarity) {
        best = {
          startSegmentIndex: startIndex,
          endSegmentIndex: endIndex,
          startTimeSeconds: segments[startIndex].startTimeSeconds,
          endTimeSeconds: segments[endIndex].endTimeSeconds,
          rawText,
          normalizedText,
          similarity,
        };
      }

      if (
        normalizedText.length >
          Math.max(sentenceNormalizedText.length * 2.2, sentenceNormalizedText.length + 18) &&
        similarity < 0.35
      ) {
        break;
      }
    }
  }

  return best;
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

function assertAlignmentQualityOrThrow(
  metrics: HumanRecordingAlignmentMetrics
): void {
  const minimumMatchedCount = Math.max(
    2,
    Math.ceil(metrics.totalSentenceCount * 0.35)
  );

  if (metrics.matchedSentenceCount < minimumMatchedCount) {
    throw new Error(`human_alignment_insufficient:${JSON.stringify(metrics)}`);
  }

  if (metrics.matchedSentenceRatio < 0.45) {
    throw new Error(`human_alignment_insufficient:${JSON.stringify(metrics)}`);
  }

  if (metrics.coveredCharacterRatio < 0.55) {
    throw new Error(`human_alignment_insufficient:${JSON.stringify(metrics)}`);
  }

  if (metrics.averageSimilarity < 0.58) {
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
  const sentences = buildHumanAlignedSentenceList(body).filter(
    (sentence) => sentence.normalizedText.length > 0
  );

  if (sentences.length === 0) {
    throw new Error("episode_body_empty");
  }

  const segments = transcription.segments.filter(
    (segment) =>
      segment.text.trim().length > 0 &&
      Number.isFinite(segment.startTimeSeconds) &&
      Number.isFinite(segment.endTimeSeconds) &&
      segment.endTimeSeconds >= segment.startTimeSeconds
  );

  if (segments.length === 0) {
    throw new Error("human_transcription_empty");
  }

  let segmentCursor = 0;
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
      sentenceNormalizedText: sentence.normalizedText,
    });

    if (!candidate) {
      continue;
    }

    const requiredSimilarity = getRequiredSimilarity(
      sentence.normalizedText.length
    );

    if (candidate.similarity < requiredSimilarity) {
      continue;
    }

    matchedSentenceCount += 1;
    coveredCharacterCount += sentence.normalizedText.length;
    accumulatedSimilarity += candidate.similarity;
    segmentCursor = candidate.endSegmentIndex + 1;

    sentenceTimings.push({
      sentenceIndex: sentence.sentenceIndex,
      paragraphIndex: sentence.paragraphIndex,
      chunkIndex: matchedSentenceCount - 1,
      timeSeconds: roundTiming(candidate.startTimeSeconds),
      durationSeconds: roundTiming(
        Math.max(candidate.endTimeSeconds - candidate.startTimeSeconds, 0.01)
      ),
      targetText: sentence.text,
      spokenText: candidate.rawText,
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