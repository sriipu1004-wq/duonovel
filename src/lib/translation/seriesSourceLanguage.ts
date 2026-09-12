import type { SeriesRow } from "@/features/write/writeShared";
import { getSeriesSummary, pickText } from "@/features/write/writeShared";
import { detectSourceLanguageFromText } from "@/lib/translation/detectSourceLanguage";
import {
  parseSupportedLanguageTag,
  type SupportedLanguageTag,
} from "@/lib/translation/languageRegistry";
import type { ContentLanguage } from "@/i18n/contentLanguage";

export function readCanonicalSeriesSourceLanguage(
  series: SeriesRow | Record<string, unknown>
): SupportedLanguageTag | null {
  return parseSupportedLanguageTag(
    series.source_language ?? series["sourceLanguage"]
  );
}

export function inferSeriesSourceLanguage(
  series: SeriesRow | Record<string, unknown>,
  sourceText?: string | null
): SupportedLanguageTag | null {
  const canonical = readCanonicalSeriesSourceLanguage(series);
  if (canonical) return canonical;

  const fallbackText =
    typeof sourceText === "string" && sourceText.trim()
      ? sourceText
      : [
          pickText(series.title),
          getSeriesSummary(series as SeriesRow),
        ]
          .filter(Boolean)
          .join("\n");

  return fallbackText.trim()
    ? detectSourceLanguageFromText(fallbackText)
    : null;
}

export function sourceLanguageToContentLanguage(
  language: SupportedLanguageTag | null
): ContentLanguage {
  if (language === "ja" || language === "en" || language === "ko") {
    return language;
  }
  return "other";
}
