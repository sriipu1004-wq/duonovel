import { preprocessNemoBody } from "@/lib/recording/nemoTextPreprocess";

export type NemoTextChunk = {
  text: string;
  pauseAfterMs: number;
  paragraphIndex: number;
  chunkIndex: number;
};

const DEFAULT_MAX_CHARS = 140;
const SENTENCE_PAUSE_MS = 260;
const PARAGRAPH_PAUSE_MS = 620;
const OVERFLOW_CHUNK_PAUSE_MS = 160;

function splitIntoSentenceUnits(paragraph: string): string[] {
  const matched = paragraph.match(/[^。！？!?…]+[。！？!?…]?/gu);

  if (!matched || matched.length === 0) {
    return [paragraph.trim()].filter(Boolean);
  }

  return matched.map((unit) => unit.trim()).filter(Boolean);
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

function endsWithSentencePunctuation(text: string): boolean {
  return /[。！？!?…]$/u.test(text.trim());
}

export function buildNemoChunks(
  body: string,
  maxChars = DEFAULT_MAX_CHARS
): NemoTextChunk[] {
  const paragraphs = preprocessNemoBody(body);
  const chunks: NemoTextChunk[] = [];

  paragraphs.forEach((paragraph, paragraphIndex) => {
    const sentenceUnits = splitIntoSentenceUnits(paragraph);

    let chunkIndex = 0;

    sentenceUnits.forEach((sentenceUnit, sentenceIndex) => {
      const splitUnits = splitLongUnit(sentenceUnit, maxChars);

      splitUnits.forEach((splitUnit, splitIndex) => {
        const isLastSplitOfSentence = splitIndex === splitUnits.length - 1;
        const isLastSentenceOfParagraph = sentenceIndex === sentenceUnits.length - 1;
        const hasSentenceEnding = endsWithSentencePunctuation(splitUnit);

        let pauseAfterMs = 0;

        if (!isLastSplitOfSentence) {
          pauseAfterMs = OVERFLOW_CHUNK_PAUSE_MS;
        } else if (isLastSentenceOfParagraph) {
          pauseAfterMs = hasSentenceEnding ? PARAGRAPH_PAUSE_MS : 420;
        } else {
          pauseAfterMs = hasSentenceEnding ? SENTENCE_PAUSE_MS : OVERFLOW_CHUNK_PAUSE_MS;
        }

        chunks.push({
          text: splitUnit,
          pauseAfterMs,
          paragraphIndex,
          chunkIndex,
        });

        chunkIndex += 1;
      });
    });
  });

  return chunks;
}