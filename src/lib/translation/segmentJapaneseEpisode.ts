import {
  normalizeJapaneseForTranslation,
  normalizeTranslationSourceText,
  segmentSourceDocument,
  type TranslationSourceDocument,
  type TranslationSourceSegment,
} from "@/lib/translation/segmentSourceDocument";

export {
  normalizeJapaneseForTranslation,
  normalizeTranslationSourceText,
  type TranslationSourceDocument,
  type TranslationSourceSegment,
};

/** Compatibility wrapper for callers that still explicitly request Japanese segmentation. */
export function segmentJapaneseEpisode(body: string): TranslationSourceDocument {
  return segmentSourceDocument(body, "ja");
}
