import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildEpisodeTranslationSource,
  buildEpisodeTranslationSourceHash,
  resolveEpisodeTranslationAccess,
} from "@/lib/translation/episodeTranslationServer";
import {
  isPublicTranslationLanguagePair,
  parseSupportedLanguageTag,
  type SupportedLanguageTag,
} from "@/lib/translation/languageRegistry";
import {
  TRANSLATION_SEGMENT_VERSION,
  createTranslationPayload,
  parseStoredTranslationPayload,
  type TranslationPayload,
  type TranslationSegment,
} from "@/lib/translation/translationPayload";
import {
  getSeriesPublicationStatus,
  isEpisodePubliclyVisible,
  pickText,
} from "@/features/write/writeShared";

export type HumanTranslationStatus = "draft" | "published" | "withdrawn";

export type HumanTranslationRow = {
  id: string;
  series_id: string;
  episode_id: string;
  translator_user_id: string;
  source_language: string;
  target_language: string;
  source_hash: string;
  published_source_hash: string | null;
  segment_version: number;
  status: HumanTranslationStatus;
  draft_payload: unknown;
  published_payload: unknown;
  rights_confirmed_at: string | null;
  published_at: string | null;
  withdrawn_at: string | null;
  created_at: string;
  updated_at: string;
};

export function isHumanTranslationPermissionOpen(series: Record<string, unknown>): boolean {
  return series.human_translation_permission_mode === "open";
}

export async function resolveHumanTranslationContext(
  episodeId: string,
  targetLanguageValue: unknown
) {
  const targetLanguage = parseSupportedLanguageTag(targetLanguageValue);
  const access = await resolveEpisodeTranslationAccess(episodeId);
  if (!access || !access.sourceLanguage || !targetLanguage) return null;
  const sourceLanguage = access.sourceLanguage;
  if (!isPublicTranslationLanguagePair({ sourceLanguage, targetLanguage })) return null;

  const publicSource =
    getSeriesPublicationStatus(access.series) === "public" &&
    isEpisodePubliclyVisible(access.episode);
  if (!publicSource || !access.canRead || !access.body.trim()) return null;

  const sourceDocument = buildEpisodeTranslationSource(access.body, sourceLanguage);
  return {
    ...access,
    sourceLanguage,
    targetLanguage,
    sourceDocument,
    sourceHash: buildEpisodeTranslationSourceHash(access.body),
    humanPermissionOpen: isHumanTranslationPermissionOpen(access.series),
    seriesAuthorId: pickText(access.series.author_id),
  };
}

function readLoosePayload(value: unknown): TranslationPayload | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const root = value as Record<string, unknown>;
  const sourceLanguage = parseSupportedLanguageTag(root.sourceLanguage);
  const targetLanguage = parseSupportedLanguageTag(root.targetLanguage);
  if (!sourceLanguage || !targetLanguage || !Array.isArray(root.segments)) return null;
  const segments: TranslationSegment[] = [];
  for (const item of root.segments) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const row = item as Record<string, unknown>;
    if (
      typeof row.id !== "string" ||
      typeof row.sourceText !== "string" ||
      typeof row.translatedText !== "string" ||
      typeof row.paragraphIndex !== "number" ||
      typeof row.sentenceIndex !== "number" ||
      typeof row.startOffset !== "number" ||
      typeof row.endOffset !== "number"
    ) continue;
    segments.push({
      id: row.id,
      sourceText: row.sourceText,
      translatedText: row.translatedText,
      paragraphIndex: row.paragraphIndex,
      sentenceIndex: row.sentenceIndex,
      startOffset: row.startOffset,
      endOffset: row.endOffset,
    });
  }
  return {
    version: typeof root.version === "number" ? root.version : TRANSLATION_SEGMENT_VERSION,
    sourceLanguage,
    targetLanguage,
    segments,
  };
}

function exactReusableTranslations(payload: unknown): Map<string, string> {
  const parsed = readLoosePayload(payload);
  if (!parsed) return new Map();
  const counts = new Map<string, number>();
  for (const segment of parsed.segments) {
    counts.set(segment.sourceText, (counts.get(segment.sourceText) ?? 0) + 1);
  }
  const reusable = new Map<string, string>();
  for (const segment of parsed.segments) {
    if ((counts.get(segment.sourceText) ?? 0) !== 1 || !segment.translatedText.trim()) continue;
    reusable.set(segment.sourceText, segment.translatedText);
  }
  return reusable;
}

export function buildHumanDraftPayload(args: {
  sourceLanguage: SupportedLanguageTag;
  targetLanguage: SupportedLanguageTag;
  sourceSegments: Array<{
    id: string; sourceText: string; paragraphIndex: number; sentenceIndex: number;
    startOffset: number; endOffset: number;
  }>;
  previousPayload?: unknown;
}): TranslationPayload {
  const reusable = exactReusableTranslations(args.previousPayload);
  const sourceCounts = new Map<string, number>();
  for (const segment of args.sourceSegments) {
    sourceCounts.set(segment.sourceText, (sourceCounts.get(segment.sourceText) ?? 0) + 1);
  }
  return createTranslationPayload({
    sourceLanguage: args.sourceLanguage,
    targetLanguage: args.targetLanguage,
    segments: args.sourceSegments.map((segment) => ({
      ...segment,
      translatedText:
        (sourceCounts.get(segment.sourceText) ?? 0) === 1
          ? reusable.get(segment.sourceText) ?? ""
          : "",
    })),
  });
}

export function buildHumanDraftPayloadFromTranslations(args: {
  sourceLanguage: SupportedLanguageTag;
  targetLanguage: SupportedLanguageTag;
  sourceSegments: Array<{
    id: string; sourceText: string; paragraphIndex: number; sentenceIndex: number;
    startOffset: number; endOffset: number;
  }>;
  translations: Record<string, string>;
}): TranslationPayload {
  return createTranslationPayload({
    sourceLanguage: args.sourceLanguage,
    targetLanguage: args.targetLanguage,
    segments: args.sourceSegments.map((segment) => ({
      ...segment,
      translatedText: typeof args.translations[segment.id] === "string"
        ? args.translations[segment.id]
        : "",
    })),
  });
}

export function validatePublishableHumanPayload(args: {
  payload: unknown;
  sourceLanguage: SupportedLanguageTag;
  targetLanguage: SupportedLanguageTag;
  sourceSegments: Array<{
    id: string; sourceText: string; paragraphIndex: number; sentenceIndex: number;
    startOffset: number; endOffset: number;
  }>;
}): TranslationPayload | null {
  const parsed = parseStoredTranslationPayload(args.payload, {
    sourceLanguage: args.sourceLanguage,
    targetLanguage: args.targetLanguage,
  });
  if (!parsed || parsed.version !== TRANSLATION_SEGMENT_VERSION) return null;
  if (parsed.segments.length !== args.sourceSegments.length) return null;
  for (let index = 0; index < args.sourceSegments.length; index += 1) {
    const expected = args.sourceSegments[index]!;
    const actual = parsed.segments[index]!;
    if (
      actual.id !== expected.id ||
      actual.sourceText !== expected.sourceText ||
      actual.paragraphIndex !== expected.paragraphIndex ||
      actual.sentenceIndex !== expected.sentenceIndex ||
      actual.startOffset !== expected.startOffset ||
      actual.endOffset !== expected.endOffset ||
      !actual.translatedText.trim()
    ) return null;
  }
  return parsed;
}

export async function hasCurrentPublishedHumanTranslation(args: {
  episodeId: string;
  body: string;
}): Promise<boolean> {
  const admin = createAdminClient();
  const result = await admin
    .from("episode_human_translations")
    .select("id")
    .eq("episode_id", args.episodeId)
    .eq("status", "published")
    .eq("published_source_hash", buildEpisodeTranslationSourceHash(args.body))
    .limit(1);
  return !result.error && (result.data?.length ?? 0) > 0;
}
