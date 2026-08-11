export type TranslationSourceSegment = {
  id: string;
  ja: string;
  translationInput: string;
  paragraphIndex: number;
  sentenceIndex: number;
  startOffset: number;
  endOffset: number;
};

export type TranslationSourceDocument = {
  version: 1;
  normalizedSource: string;
  segments: TranslationSourceSegment[];
};

const SENTENCE_END_CHARS = new Set(["。", "！", "？", "!", "?"]);
const CLOSING_CHARS = new Set(["」", "』", "）", "】", "］", "”", "’"]);

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

function splitParagraph(args: {
  source: string;
  paragraphStart: number;
  paragraphEnd: number;
  paragraphIndex: number;
}): TranslationSourceSegment[] {
  const { source, paragraphStart, paragraphEnd, paragraphIndex } = args;
  const segments: TranslationSourceSegment[] = [];
  let segmentStart = paragraphStart;
  let sentenceIndex = 0;
  let cursor = paragraphStart;

  function pushSegment(rawEnd: number) {
    const [startOffset, endOffset] = trimSegmentBounds(source, segmentStart, rawEnd);
    segmentStart = rawEnd;

    if (endOffset <= startOffset) {
      return;
    }

    const ja = source.slice(startOffset, endOffset);
    const translationInput = normalizeJapaneseForTranslation(ja);

    if (!translationInput) {
      return;
    }

    segments.push({
      id: formatSegmentId(paragraphIndex, sentenceIndex),
      ja,
      translationInput,
      paragraphIndex,
      sentenceIndex,
      startOffset,
      endOffset,
    });
    sentenceIndex += 1;
  }

  while (cursor < paragraphEnd) {
    const current = source[cursor] ?? "";

    if (!SENTENCE_END_CHARS.has(current)) {
      cursor += 1;
      continue;
    }

    let end = cursor + 1;
    while (end < paragraphEnd && SENTENCE_END_CHARS.has(source[end] ?? "")) {
      end += 1;
    }
    while (end < paragraphEnd && CLOSING_CHARS.has(source[end] ?? "")) {
      end += 1;
    }

    pushSegment(end);
    cursor = end;
  }

  if (segmentStart < paragraphEnd) {
    pushSegment(paragraphEnd);
  }

  return segments;
}

export function segmentJapaneseEpisode(body: string): TranslationSourceDocument {
  const normalizedSource = normalizeTranslationSourceText(body);
  const segments: TranslationSourceSegment[] = [];
  let paragraphIndex = 0;
  let cursor = 0;

  while (cursor < normalizedSource.length) {
    while (cursor < normalizedSource.length && normalizedSource[cursor] === "\n") {
      cursor += 1;
    }

    if (cursor >= normalizedSource.length) {
      break;
    }

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

    const paragraphSegments = splitParagraph({
      source: normalizedSource,
      paragraphStart,
      paragraphEnd,
      paragraphIndex,
    });

    if (paragraphSegments.length > 0) {
      segments.push(...paragraphSegments);
      paragraphIndex += 1;
    }
  }

  return {
    version: 1,
    normalizedSource,
    segments,
  };
}
