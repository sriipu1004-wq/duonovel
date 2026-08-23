import {
  parseSupportedLanguageTag,
  type SupportedLanguageTag,
} from "@/lib/translation/languageRegistry";

export const TRANSLATION_SEGMENT_VERSION = 2;

export type TranslationSegment = {
  id: string;
  sourceText: string;
  translatedText: string;
  paragraphIndex: number;
  sentenceIndex: number;
  startOffset: number;
  endOffset: number;
};

export type TranslationPayload = {
  version: number;
  sourceLanguage: SupportedLanguageTag;
  targetLanguage: SupportedLanguageTag;
  segments: TranslationSegment[];
};

function readSegmentPosition(row: Record<string, unknown>) {
  if (
    typeof row.id !== "string" ||
    typeof row.paragraphIndex !== "number" ||
    typeof row.sentenceIndex !== "number" ||
    typeof row.startOffset !== "number" ||
    typeof row.endOffset !== "number"
  ) {
    return null;
  }

  return {
    id: row.id,
    paragraphIndex: row.paragraphIndex,
    sentenceIndex: row.sentenceIndex,
    startOffset: row.startOffset,
    endOffset: row.endOffset,
  };
}

function parseSegment(item: unknown): TranslationSegment | null {
  if (!item || typeof item !== "object") return null;
  const row = item as Record<string, unknown>;
  const position = readSegmentPosition(row);
  if (!position) return null;

  if (
    typeof row.sourceText === "string" &&
    typeof row.translatedText === "string"
  ) {
    return {
      ...position,
      sourceText: row.sourceText,
      translatedText: row.translatedText,
    };
  }

  if (typeof row.ja === "string" && typeof row.en === "string") {
    return {
      ...position,
      sourceText: row.ja,
      translatedText: row.en,
    };
  }

  return null;
}

export function parseStoredTranslationPayload(
  value: unknown,
  expected: {
    sourceLanguage: SupportedLanguageTag;
    targetLanguage: SupportedLanguageTag;
  }
): TranslationPayload | null {
  if (!value || typeof value !== "object") return null;
  const root = value as Record<string, unknown>;
  const rawSegments = Array.isArray(root.segments) ? root.segments : null;
  if (!rawSegments) return null;

  const storedSourceLanguage = parseSupportedLanguageTag(root.sourceLanguage);
  const storedTargetLanguage = parseSupportedLanguageTag(root.targetLanguage);

  if (
    (storedSourceLanguage && storedSourceLanguage !== expected.sourceLanguage) ||
    (storedTargetLanguage && storedTargetLanguage !== expected.targetLanguage)
  ) {
    return null;
  }

  const segments: TranslationSegment[] = [];
  for (const item of rawSegments) {
    const segment = parseSegment(item);
    if (!segment || !segment.sourceText.trim() || !segment.translatedText.trim()) {
      return null;
    }
    segments.push(segment);
  }

  return {
    version:
      typeof root.version === "number" && Number.isFinite(root.version)
        ? root.version
        : 1,
    sourceLanguage: storedSourceLanguage ?? expected.sourceLanguage,
    targetLanguage: storedTargetLanguage ?? expected.targetLanguage,
    segments,
  };
}

export function createTranslationPayload(args: {
  sourceLanguage: SupportedLanguageTag;
  targetLanguage: SupportedLanguageTag;
  segments: TranslationSegment[];
}): TranslationPayload {
  return {
    version: TRANSLATION_SEGMENT_VERSION,
    sourceLanguage: args.sourceLanguage,
    targetLanguage: args.targetLanguage,
    segments: args.segments,
  };
}
