import { preprocessNemoBodyToParagraphs } from "@/lib/recording/nemoTextPreprocess";

export type HumanAlignedSentenceSegment = {
  index: number;
  text: string;
};

export type HumanAlignedParagraphBlock = {
  paragraphIndex: number;
  segments: HumanAlignedSentenceSegment[];
};

export type HumanAlignedSentenceEntry = {
  sentenceIndex: number;
  paragraphIndex: number;
  text: string;
  normalizedText: string;
};

export function normalizeComparableSentenceText(text: string): string {
  return text
    .replace(/\s+/gu, "")
    .replace(/[「」『』（）()［］【】]/gu, "")
    .trim();
}

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

export function splitIntoTrackingSentenceUnits(paragraph: string): string[] {
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

export const READER_DISPLAY_CLAUSE_TARGET_CHARS = 160;
export const READER_DISPLAY_CLAUSE_MIN_CHARS = 56;
export const READER_DISPLAY_CLAUSE_MAX_LOOKAHEAD_CHARS = 240;

const READER_DISPLAY_CLAUSE_BOUNDARIES = new Set([
  "、",
  ",",
  "，",
  ";",
  "；",
  ":",
  "：",
]);

export function splitSentenceIntoDisplayClauses(sentence: string): string[] {
  const normalized = sentence.trim();

  if (!normalized) {
    return [];
  }

  if (normalized.length <= READER_DISPLAY_CLAUSE_TARGET_CHARS) {
    return [normalized];
  }

  const candidates: number[] = [];
  for (let cursor = 0; cursor < normalized.length; cursor += 1) {
    if (READER_DISPLAY_CLAUSE_BOUNDARIES.has(normalized[cursor] ?? "")) {
      candidates.push(cursor + 1);
    }
  }
  if (candidates.length === 0) return [normalized];

  const clauses: string[] = [];
  let start = 0;

  while (normalized.length - start > READER_DISPLAY_CLAUSE_TARGET_CHARS) {
    const min = start + READER_DISPLAY_CLAUSE_MIN_CHARS;
    const target = start + READER_DISPLAY_CLAUSE_TARGET_CHARS;
    const max = Math.min(
      normalized.length,
      start + READER_DISPLAY_CLAUSE_MAX_LOOKAHEAD_CHARS
    );
    const beforeTarget = candidates.filter(
      (candidate) => candidate >= min && candidate <= target
    );
    const afterTarget = candidates.filter(
      (candidate) => candidate > target && candidate <= max
    );
    const splitAt =
      beforeTarget[beforeTarget.length - 1] ??
      afterTarget[0] ??
      null;

    if (splitAt === null || splitAt <= start || splitAt >= normalized.length) {
      break;
    }

    const clause = normalized.slice(start, splitAt).trim();
    if (clause) clauses.push(clause);
    start = splitAt;
  }

  const tail = normalized.slice(start).trim();
  if (tail) clauses.push(tail);

  if (
    clauses.length >= 2 &&
    clauses[clauses.length - 1]!.length < READER_DISPLAY_CLAUSE_MIN_CHARS
  ) {
    const tailClause = clauses.pop()!;
    clauses[clauses.length - 1] = `${clauses[clauses.length - 1]} ${tailClause}`;
  }

  return clauses.length > 0 ? clauses : [normalized];
}

export function buildNemoAlignedParagraphBlocks(
  body: string
): HumanAlignedParagraphBlock[] {
  const paragraphs = preprocessNemoBodyToParagraphs(body).map(
    (paragraph) => paragraph.originalParagraph
  );

  let nextSentenceIndex = 0;

  return paragraphs.map((paragraph, paragraphIndex) => ({
    paragraphIndex,
    segments: splitIntoTrackingSentenceUnits(paragraph).map((text) => ({
      index: nextSentenceIndex++,
      text,
    })),
  }));
}

export function buildHumanAlignedSentenceList(
  body: string
): HumanAlignedSentenceEntry[] {
  return buildNemoAlignedParagraphBlocks(body).flatMap((paragraphBlock) =>
    paragraphBlock.segments.map((segment) => ({
      sentenceIndex: segment.index,
      paragraphIndex: paragraphBlock.paragraphIndex,
      text: segment.text,
      normalizedText: normalizeComparableSentenceText(segment.text),
    }))
  );
}