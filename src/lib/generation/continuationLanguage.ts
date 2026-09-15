import { detectSourceLanguageFromText } from "@/lib/translation/detectSourceLanguage";
import {
  getSupportedLanguage,
  parseSupportedLanguageTag,
  type SupportedLanguageTag,
} from "@/lib/translation/languageRegistry";

export function resolveContinuationSourceLanguage(
  storedSourceLanguage: unknown,
  latestBody: string
): SupportedLanguageTag {
  return (
    parseSupportedLanguageTag(storedSourceLanguage) ??
    detectSourceLanguageFromText(latestBody)
  );
}

export function continuationEpisodeFallbackTitle(
  episodeNumber: number,
  sourceLanguage: SupportedLanguageTag
): string {
  if (sourceLanguage === "ja") return `第${episodeNumber}話`;
  if (sourceLanguage === "en") return `Episode ${episodeNumber}`;
  if (sourceLanguage === "ko") return `${episodeNumber}화`;
  if (sourceLanguage === "fr") return `Épisode ${episodeNumber}`;
  if (sourceLanguage === "de") return `Kapitel ${episodeNumber}`;
  if (sourceLanguage === "es") return `Episodio ${episodeNumber}`;
  return `第${episodeNumber}章`;
}

export function continuationLanguageInstruction(
  sourceLanguage: SupportedLanguageTag
): string {
  const language = getSupportedLanguage(sourceLanguage);
  return [
    `- episodeTitle、body、continuitySummary は必ず ${language.label} (${language.nativeLabel}) で書く。`,
    "- UI言語や利用者の希望文の言語ではなく、既存作品の原文言語を維持する。",
  ].join("\n");
}
