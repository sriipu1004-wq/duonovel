import type { SupportedLanguageTag } from "@/lib/translation/languageRegistry";

export type TranslationSourceSegment = {
  id: string;
  sourceText: string;
  translationInput: string;
  paragraphIndex: number;
  sentenceIndex: number;
  startOffset: number;
  endOffset: number;
};

export type TranslationSourceDocument = {
  version: 3;
  sourceLanguage: SupportedLanguageTag;
  normalizedSource: string;
  segments: TranslationSourceSegment[];
};

type TranslationNormalizer = (value: string) => string;

const JAPANESE_SENTENCE_END_CHARS = new Set(["。", "！", "？", "!", "?"]);
const JAPANESE_CLOSING_CHARS = new Set([
  "」",
  "』",
  "）",
  "】",
  "］",
  "”",
  "’",
]);

export const TRANSLATION_CLAUSE_SPLIT_TARGET_CHARS = 56;
export const TRANSLATION_CLAUSE_SPLIT_MIN_CHARS = 20;
export const TRANSLATION_CLAUSE_SPLIT_MAX_LOOKAHEAD_CHARS = 80;

const CLAUSE_BOUNDARY_CHARS = new Set(["、", ",", "，", ";", "；", ":", "："]);

function splitLongClauseBounds(
  source: string,
  start: number,
  end: number
): Array<[number, number]> {
  if (end - start <= TRANSLATION_CLAUSE_SPLIT_TARGET_CHARS) {
    return [[start, end]];
  }

  const clauseCandidates: number[] = [];
  const wordCandidates: number[] = [];
  for (let cursor = start; cursor < end; cursor += 1) {
    const current = source[cursor] ?? "";
    if (CLAUSE_BOUNDARY_CHARS.has(current)) {
      clauseCandidates.push(cursor + 1);
      continue;
    }
    if (/\s/u.test(current)) {
      wordCandidates.push(cursor + 1);
    }
  }

  const result: Array<[number, number]> = [];
  let segmentStart = start;

  while (end - segmentStart > TRANSLATION_CLAUSE_SPLIT_TARGET_CHARS) {
    const min = segmentStart + TRANSLATION_CLAUSE_SPLIT_MIN_CHARS;
    const target = segmentStart + TRANSLATION_CLAUSE_SPLIT_TARGET_CHARS;
    const max = Math.min(
      end,
      segmentStart + TRANSLATION_CLAUSE_SPLIT_MAX_LOOKAHEAD_CHARS
    );

    const pickBoundary = (candidates: number[]) => {
      const beforeTarget = candidates.filter(
        (candidate) => candidate >= min && candidate <= target
      );
      const afterTarget = candidates.filter(
        (candidate) => candidate > target && candidate <= max
      );
      return beforeTarget[beforeTarget.length - 1] ?? afterTarget[0] ?? null;
    };

    const splitAt =
      pickBoundary(clauseCandidates) ??
      pickBoundary(wordCandidates) ??
      Math.min(target, end);

    if (splitAt <= segmentStart || splitAt >= end) {
      break;
    }

    result.push([segmentStart, splitAt]);
    segmentStart = splitAt;
  }

  if (segmentStart < end) {
    result.push([segmentStart, end]);
  }

  if (result.length >= 2) {
    const last = result[result.length - 1]!;
    if (last[1] - last[0] < TRANSLATION_CLAUSE_SPLIT_MIN_CHARS) {
      const previous = result[result.length - 2]!;
      if (
        last[1] - previous[0] <=
        TRANSLATION_CLAUSE_SPLIT_MAX_LOOKAHEAD_CHARS
      ) {
        result.splice(result.length - 2, 2, [previous[0], last[1]]);
      }
    }
  }

  return result.length > 0 ? result : [[start, end]];
}

export function normalizeTranslationSourceText(body: string): string {
  return body.replace(/\r\n?/g, "\n");
}

export function normalizeJapaneseForTranslation(value: string): string {
  return value
    .replace(/｜([^《》\r\n]+)《([^《》\r\n]+)》/gu, "$1（読み：$2）")
    .replace(
      /([一-龯々〆ヵヶ〓]+)《([^《》\r\n]+)》/gu,
      "$1（読み：$2）"
    )
    .replace(/［＃[^］\r\n]*］/gu, "")
    .replace(/[ \t]+\n/gu, "\n")
    .replace(/\n[ \t]+/gu, "\n")
    .trim();
}

function normalizeGenericForTranslation(value: string): string {
  return value
    .replace(/[ \t]+\n/gu, "\n")
    .replace(/\n[ \t]+/gu, "\n")
    .trim();
}

export function getTranslationNormalizer(
  sourceLanguage: SupportedLanguageTag
): TranslationNormalizer {
  return sourceLanguage === "ja"
    ? normalizeJapaneseForTranslation
    : normalizeGenericForTranslation;
}

export function normalizeSourceForTranslation(
  value: string,
  sourceLanguage: SupportedLanguageTag
): string {
  return getTranslationNormalizer(sourceLanguage)(value);
}

function formatSegmentId(paragraphIndex: number, sentenceIndex: number): string {
  return `p${String(paragraphIndex).padStart(3, "0")}-s${String(sentenceIndex).padStart(3, "0")}`;
}

function trimSegmentBounds(source: string, start: number, end: number): [number, number] {
  let nextStart = start;
  let nextEnd = end;

  while (nextStart < nextEnd && /\s/u.test(source[nextStart] ?? "")) {
    nextStart += 1;
  }

  while (nextEnd > nextStart && /\s/u.test(source[nextEnd - 1] ?? "")) {
    nextEnd -= 1;
  }

  return [nextStart, nextEnd];
}

function createSegmentCollector(args: {
  source: string;
  paragraphIndex: number;
  sourceLanguage: SupportedLanguageTag;
}) {
  const segments: TranslationSourceSegment[] = [];
  const normalize = getTranslationNormalizer(args.sourceLanguage);
  let sentenceIndex = 0;

  function pushExact(start: number, end: number) {
    const [startOffset, endOffset] = trimSegmentBounds(args.source, start, end);
    if (endOffset <= startOffset) return;

    const sourceText = args.source.slice(startOffset, endOffset);
    const translationInput = normalize(sourceText);
    if (!translationInput) return;

    segments.push({
      id: formatSegmentId(args.paragraphIndex, sentenceIndex),
      sourceText,
      translationInput,
      paragraphIndex: args.paragraphIndex,
      sentenceIndex,
      startOffset,
      endOffset,
    });
    sentenceIndex += 1;
  }

  function push(start: number, end: number) {
    const [trimmedStart, trimmedEnd] = trimSegmentBounds(args.source, start, end);
    if (trimmedEnd <= trimmedStart) return;
    const bounds = splitLongClauseBounds(args.source, trimmedStart, trimmedEnd);
    for (const [clauseStart, clauseEnd] of bounds) {
      pushExact(clauseStart, clauseEnd);
    }
  }

  return { segments, push };
}

function splitJapaneseParagraph(args: {
  source: string;
  paragraphStart: number;
  paragraphEnd: number;
  paragraphIndex: number;
  sourceLanguage: SupportedLanguageTag;
}): TranslationSourceSegment[] {
  const collector = createSegmentCollector(args);
  let segmentStart = args.paragraphStart;
  let cursor = args.paragraphStart;

  while (cursor < args.paragraphEnd) {
    const current = args.source[cursor] ?? "";

    if (!JAPANESE_SENTENCE_END_CHARS.has(current)) {
      cursor += 1;
      continue;
    }

    let end = cursor + 1;
    while (
      end < args.paragraphEnd &&
      JAPANESE_SENTENCE_END_CHARS.has(args.source[end] ?? "")
    ) {
      end += 1;
    }
    while (
      end < args.paragraphEnd &&
      JAPANESE_CLOSING_CHARS.has(args.source[end] ?? "")
    ) {
      end += 1;
    }

    collector.push(segmentStart, end);
    segmentStart = end;
    cursor = end;
  }

  if (segmentStart < args.paragraphEnd) {
    collector.push(segmentStart, args.paragraphEnd);
  }

  return collector.segments;
}

function splitGenericParagraph(args: {
  source: string;
  paragraphStart: number;
  paragraphEnd: number;
  paragraphIndex: number;
  sourceLanguage: SupportedLanguageTag;
}): TranslationSourceSegment[] {
  const collector = createSegmentCollector(args);
  const paragraph = args.source.slice(args.paragraphStart, args.paragraphEnd);

  if (typeof Intl.Segmenter === "function") {
    const segmenter = new Intl.Segmenter(args.sourceLanguage, {
      granularity: "sentence",
    });

    for (const item of segmenter.segment(paragraph)) {
      const start = args.paragraphStart + item.index;
      collector.push(start, start + item.segment.length);
    }

    return collector.segments;
  }

  const boundary = /[^.!?。！？]+(?:[.!?。！？]+["'”’）】］』」]*)?|[.!?。！？]+/gu;
  for (const match of paragraph.matchAll(boundary)) {
    const relativeStart = match.index ?? 0;
    collector.push(
      args.paragraphStart + relativeStart,
      args.paragraphStart + relativeStart + match[0].length
    );
  }

  return collector.segments;
}

export function segmentSourceDocument(
  body: string,
  sourceLanguage: SupportedLanguageTag
): TranslationSourceDocument {
  const normalizedSource = normalizeTranslationSourceText(body);
  const segments: TranslationSourceSegment[] = [];
  let paragraphIndex = 0;
  let cursor = 0;

  while (cursor < normalizedSource.length) {
    while (cursor < normalizedSource.length && normalizedSource[cursor] === "\n") {
      cursor += 1;
    }

    if (cursor >= normalizedSource.length) break;

    const paragraphStart = cursor;
    let paragraphEnd = normalizedSource.length;
    const separatorMatch = /\n{2,}/gu;
    separatorMatch.lastIndex = cursor;
    const match = separatorMatch.exec(normalizedSource);

    if (match) {
      paragraphEnd = match.index;
      cursor = match.index + match[0].length;
    } else {
      cursor = normalizedSource.length;
    }

    const split = sourceLanguage === "ja" ? splitJapaneseParagraph : splitGenericParagraph;
    const paragraphSegments = split({
      source: normalizedSource,
      paragraphStart,
      paragraphEnd,
      paragraphIndex,
      sourceLanguage,
    });

    if (paragraphSegments.length > 0) {
      segments.push(...paragraphSegments);
      paragraphIndex += 1;
    }
  }

  return {
    version: 3,
    sourceLanguage,
    normalizedSource,
    segments,
  };
}
