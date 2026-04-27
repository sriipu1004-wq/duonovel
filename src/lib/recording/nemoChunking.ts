import {
  preprocessNemoBodyToParagraphs,
  type NemoPreprocessOptions,
} from "@/lib/recording/nemoTextPreprocess";

export type NemoTextChunk = {
  text: string;
  pauseAfterMs: number;
  paragraphIndex: number;
  chunkIndex: number;
  sourceSentenceIndex: number;
  sourceSentenceText: string;
};

export type NemoChunkBuildOptions = NemoPreprocessOptions & {
  maxChars?: number;
};

const DEFAULT_MAX_CHARS = 32;
const SENTENCE_PAUSE_MS = 380;
const PARAGRAPH_PAUSE_MS = 920;
const PARAGRAPH_SOFT_PAUSE_MS = 620;
const PARAGRAPH_ELLIPSIS_PAUSE_MS = 980;
const PARAGRAPH_DASH_PAUSE_MS = 920;
const DIALOGUE_TO_NARRATION_PAUSE_MS = 320;
const DIALOGUE_PARAGRAPH_PAUSE_MS = 840;
const ELLIPSIS_PAUSE_MS = 520;
const DASH_PAUSE_MS = 430;
const OVERFLOW_CHUNK_PAUSE_MS = 220;

function splitByInternalPauseMarkers(unit: string): string[] {
  const normalized = unit.trim();

  if (!normalized) {
    return [];
  }

  const withBoundaries = normalized
    .replace(/([」』）】])(?=[^\s、。！？!?…」』）】])/gu, "$1\n")
    .replace(/([…⋯]+)(?=[^\s」』）】。！？!?…])/gu, "$1\n")
    .replace(/([―—─]{2,})(?=[^\s」』）】。！？!?…])/gu, "$1\n");

  return withBoundaries
    .split(/\n+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function splitIntoSentenceUnits(paragraph: string): string[] {
  const normalized = paragraph.trim();

  if (!normalized) {
    return [];
  }

  const matched = normalized.match(/[^。！？!?]+(?:[。！？!?]+[」』）】]?|$)/gu);

  if (!matched || matched.length === 0) {
    return splitByInternalPauseMarkers(normalized);
  }

  return matched
    .flatMap((unit) => splitByInternalPauseMarkers(unit))
    .filter(Boolean);
}

function splitLongUnit(unit: string, maxChars: number): string[] {
  if (unit.length <= maxChars) {
    return [unit];
  }

  const commaUnits =
    unit.match(/[^、，,]+[、，,]?/gu)?.map((part) => part.trim()).filter(Boolean) ??
    [unit];

  const merged: string[] = [];
  let current = "";

  for (const part of commaUnits) {
    if (!current) {
      current = part;
      continue;
    }

    if ((current + part).length <= maxChars) {
      current += part;
      continue;
    }

    merged.push(current);
    current = part;
  }

  if (current) {
    merged.push(current);
  }

  const finalUnits: string[] = [];

  for (const item of merged) {
    if (item.length <= maxChars) {
      finalUnits.push(item);
      continue;
    }

    for (let index = 0; index < item.length; index += maxChars) {
      finalUnits.push(item.slice(index, index + maxChars));
    }
  }

  return finalUnits;
}

function endsWithStrongSentencePunctuation(text: string): boolean {
  return /[。！？!?][」』）】]?$/u.test(text.trim());
}

function endsWithEllipsisPause(text: string): boolean {
  return /[…⋯]+[」』）】]?$/u.test(text.trim());
}

function endsWithDashPause(text: string): boolean {
  return /[―—─]{2,}[」』）】]?$/u.test(text.trim());
}

function endsWithDialogueClose(text: string): boolean {
  return /[」』）】]$/u.test(text.trim());
}

function resolvePauseAfterMs(args: {
  text: string;
  isLastSplitOfSentence: boolean;
  isLastSentenceOfParagraph: boolean;
}): number {
  const { text, isLastSplitOfSentence, isLastSentenceOfParagraph } = args;

  if (!isLastSplitOfSentence) {
    return OVERFLOW_CHUNK_PAUSE_MS;
  }

  if (isLastSentenceOfParagraph) {
    if (endsWithEllipsisPause(text)) {
      return PARAGRAPH_ELLIPSIS_PAUSE_MS;
    }

    if (endsWithDashPause(text)) {
      return PARAGRAPH_DASH_PAUSE_MS;
    }

    if (endsWithStrongSentencePunctuation(text)) {
      return PARAGRAPH_PAUSE_MS;
    }

    if (endsWithDialogueClose(text)) {
      return DIALOGUE_PARAGRAPH_PAUSE_MS;
    }

    return PARAGRAPH_SOFT_PAUSE_MS;
  }

  if (endsWithEllipsisPause(text)) {
    return ELLIPSIS_PAUSE_MS;
  }

  if (endsWithDashPause(text)) {
    return DASH_PAUSE_MS;
  }

  if (endsWithStrongSentencePunctuation(text)) {
    return SENTENCE_PAUSE_MS;
  }

  if (endsWithDialogueClose(text)) {
    return DIALOGUE_TO_NARRATION_PAUSE_MS;
  }

  return OVERFLOW_CHUNK_PAUSE_MS;
}

export function buildNemoChunks(
  body: string,
  options: NemoChunkBuildOptions = {}
): NemoTextChunk[] {
  const { maxChars = DEFAULT_MAX_CHARS, ...preprocessOptions } = options;
  const paragraphs = preprocessNemoBodyToParagraphs(body, preprocessOptions);
  const chunks: NemoTextChunk[] = [];

  let globalSentenceIndex = 0;

  paragraphs.forEach((paragraph, paragraphIndex) => {
    const originalSentenceUnits = splitIntoSentenceUnits(
      paragraph.originalParagraph
    );
    const spokenSentenceUnits = splitIntoSentenceUnits(paragraph.spokenParagraph);

    const sentenceCount = Math.max(
      originalSentenceUnits.length,
      spokenSentenceUnits.length
    );

    let chunkIndex = 0;

    for (let sentenceOffset = 0; sentenceOffset < sentenceCount; sentenceOffset += 1) {
      const originalSentenceText =
        originalSentenceUnits[sentenceOffset] ??
        spokenSentenceUnits[sentenceOffset] ??
        "";
      const spokenSentenceText =
        spokenSentenceUnits[sentenceOffset] ??
        originalSentenceUnits[sentenceOffset] ??
        "";

      if (!spokenSentenceText.trim()) {
        globalSentenceIndex += 1;
        continue;
      }

      const splitUnits = splitLongUnit(spokenSentenceText, maxChars);

      splitUnits.forEach((splitUnit, splitIndex) => {
        const isLastSplitOfSentence = splitIndex === splitUnits.length - 1;
        const isLastSentenceOfParagraph = sentenceOffset === sentenceCount - 1;

        const pauseAfterMs = resolvePauseAfterMs({
          text: splitUnit,
          isLastSplitOfSentence,
          isLastSentenceOfParagraph,
        });

        chunks.push({
          text: splitUnit,
          pauseAfterMs,
          paragraphIndex,
          chunkIndex,
          sourceSentenceIndex: globalSentenceIndex,
          sourceSentenceText: originalSentenceText.trim() || splitUnit,
        });

        chunkIndex += 1;
      });

      globalSentenceIndex += 1;
    }
  });

  return chunks;
}