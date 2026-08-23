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
  version: 2;
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

export function normalizeTranslationSourceText(body: string): string {
  return body.replace(/\r\n?/g, "\n");
}

export function normalizeJapaneseForTranslation(value: string): string {
  return value
    .replace(/｜([^《》\r\n]+)《([^《》\r\n]+)》/gu, "$1")
    .replace(/([一-龯々〆ヵヶ〓]+)《([^《》\r\n]+)》/gu, "$1")
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

  function push(start: number, end: number) {
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
    version: 2,
    sourceLanguage,
    normalizedSource,
    segments,
  };
}
