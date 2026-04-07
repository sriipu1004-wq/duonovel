import type { NemoTextChunk } from "@/lib/recording/nemoChunking";

export type NemoGeneratedSentenceTiming = {
  sentenceIndex: number;
  paragraphIndex: number;
  chunkIndex: number;
  timeSeconds: number;
  durationSeconds: number;
  targetText: string;
  spokenText: string;
};

export type NemoTimingManifest = {
  version: 1;
  generatedAt: string;
  sentenceTimings: NemoGeneratedSentenceTiming[];
};

type BuildNemoTimingManifestInput = {
  chunks: NemoTextChunk[];
  renderedSegments: Array<{
    durationSeconds: number;
  }>;
};

function roundTiming(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pickNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function pickText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function buildNemoTimingManifest({
  chunks,
  renderedSegments,
}: BuildNemoTimingManifestInput): NemoTimingManifest {
  if (chunks.length !== renderedSegments.length) {
    throw new Error("nemo_timing_manifest_failed:length_mismatch");
  }

  const emittedSentenceIndexes = new Set<number>();
  const sentenceTimings: NemoGeneratedSentenceTiming[] = [];

  let elapsedSeconds = 0;

  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index];
    const renderedSegment = renderedSegments[index];

    if (!emittedSentenceIndexes.has(chunk.sourceSentenceIndex)) {
      emittedSentenceIndexes.add(chunk.sourceSentenceIndex);

      sentenceTimings.push({
        sentenceIndex: chunk.sourceSentenceIndex,
        paragraphIndex: chunk.paragraphIndex,
        chunkIndex: chunk.chunkIndex,
        timeSeconds: roundTiming(elapsedSeconds),
        durationSeconds: roundTiming(renderedSegment.durationSeconds),
        targetText: chunk.sourceSentenceText,
        spokenText: chunk.text,
      });
    }

    elapsedSeconds += renderedSegment.durationSeconds + chunk.pauseAfterMs / 1000;
  }

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    sentenceTimings,
  };
}

export function buildNemoTimingObjectPathFromAudioObjectPath(
  audioObjectPath: string
): string {
  if (/\.wav$/i.test(audioObjectPath)) {
    return audioObjectPath.replace(/\.wav$/i, ".timing.json");
  }

  return `${audioObjectPath}.timing.json`;
}

export function buildNemoTimingPublicUrlFromAudioPublicUrl(
  audioPublicUrl: string
): string | null {
  const trimmed = audioPublicUrl.trim();

  if (!trimmed) {
    return null;
  }

  if (/\.wav$/i.test(trimmed)) {
    return trimmed.replace(/\.wav$/i, ".timing.json");
  }

  return `${trimmed}.timing.json`;
}

export function parseNemoGeneratedSentenceTimings(
  value: unknown
): NemoGeneratedSentenceTiming[] {
  const rawItems = isPlainObject(value) && Array.isArray(value.sentenceTimings)
    ? value.sentenceTimings
    : [];

  return rawItems
    .map((item) => {
      if (!isPlainObject(item)) {
        return null;
      }

      const sentenceIndex = pickNumber(item.sentenceIndex);
      const paragraphIndex = pickNumber(item.paragraphIndex);
      const chunkIndex = pickNumber(item.chunkIndex);
      const timeSeconds = pickNumber(item.timeSeconds);
      const durationSeconds = pickNumber(item.durationSeconds);

      if (
        sentenceIndex === null ||
        paragraphIndex === null ||
        chunkIndex === null ||
        timeSeconds === null ||
        durationSeconds === null
      ) {
        return null;
      }

      return {
        sentenceIndex,
        paragraphIndex,
        chunkIndex,
        timeSeconds,
        durationSeconds,
        targetText: pickText(item.targetText),
        spokenText: pickText(item.spokenText),
      };
    })
    .filter(
      (item): item is NemoGeneratedSentenceTiming =>
        item !== null &&
        item.sentenceIndex >= 0 &&
        item.paragraphIndex >= 0 &&
        item.chunkIndex >= 0 &&
        item.timeSeconds >= 0 &&
        item.durationSeconds >= 0
    )
    .sort((left, right) => {
      if (left.timeSeconds !== right.timeSeconds) {
        return left.timeSeconds - right.timeSeconds;
      }

      return left.sentenceIndex - right.sentenceIndex;
    });
}