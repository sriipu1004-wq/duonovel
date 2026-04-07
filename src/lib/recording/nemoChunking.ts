import { preprocessNemoBody } from "@/lib/recording/nemoTextPreprocess";

export type NemoTextChunk = {
  text: string;
  pauseAfterMs: number;
  paragraphIndex: number;
  chunkIndex: number;
};

const DEFAULT_MAX_CHARS = 140;
const PARAGRAPH_PAUSE_MS = 420;
const OVERFLOW_CHUNK_PAUSE_MS = 140;

function splitIntoSentenceUnits(paragraph: string): string[] {
  const matched = paragraph.match(/[^。！？!?]+[。！？!?]?/gu);

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

export function buildNemoChunks(
  body: string,
  maxChars = DEFAULT_MAX_CHARS
): NemoTextChunk[] {
  const paragraphs = preprocessNemoBody(body);
  const chunks: NemoTextChunk[] = [];

  paragraphs.forEach((paragraph, paragraphIndex) => {
    const sentenceUnits = splitIntoSentenceUnits(paragraph).flatMap((unit) =>
      splitLongUnit(unit, maxChars)
    );

    let current = "";
    let chunkIndex = 0;

    sentenceUnits.forEach((unit) => {
      if (!current) {
        current = unit;
        return;
      }

      if ((current + unit).length <= maxChars) {
        current += unit;
        return;
      }

      chunks.push({
        text: current,
        pauseAfterMs: OVERFLOW_CHUNK_PAUSE_MS,
        paragraphIndex,
        chunkIndex,
      });

      chunkIndex += 1;
      current = unit;
    });

    if (current) {
      const isLastParagraph = paragraphIndex === paragraphs.length - 1;

      chunks.push({
        text: current,
        pauseAfterMs: isLastParagraph ? 0 : PARAGRAPH_PAUSE_MS,
        paragraphIndex,
        chunkIndex,
      });
    }
  });

  return chunks;
}