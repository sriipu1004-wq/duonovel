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

export function splitSentenceIntoDisplayClauses(sentence: string): string[] {
  const normalized = sentence.trim();

  if (!normalized) {
    return [];
  }

  const matched = normalized.match(
    /[^、。！？!?…]+(?:[、。！？!?…]+[」』）】]*)?/gu
  );

  if (!matched || matched.length === 0) {
    return [normalized];
  }

  return matched.map((item) => item.trim()).filter((item) => item.length > 0);
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