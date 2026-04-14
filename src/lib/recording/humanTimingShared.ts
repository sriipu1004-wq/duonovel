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

export function splitIntoNemoAlignedSentenceUnits(paragraph: string): string[] {
  const normalized = paragraph.trim();

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
    segments: splitIntoNemoAlignedSentenceUnits(paragraph).map((text) => ({
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