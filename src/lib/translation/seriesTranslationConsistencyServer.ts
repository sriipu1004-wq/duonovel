import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  getEpisodeBody,
  getEpisodeNumber,
  getSeriesPublicationStatus,
  isEpisodePubliclyVisible,
  type EpisodeRow,
} from "@/features/write/writeShared";
import {
  buildEpisodeTranslationSource,
  buildEpisodeTranslationSourceHash,
  type EpisodeTranslationAccess,
} from "@/lib/translation/episodeTranslationServer";
import type { SupportedLanguageTag } from "@/lib/translation/languageRegistry";
import { parseStoredTranslationPayload } from "@/lib/translation/translationPayload";
import { readSeriesTranslationLearningPreference } from "@/lib/translation/translationLearningPreference";
import {
  countTranslationConsistencyReferenceChars,
  emptySeriesTranslationConsistency,
  normalizeSeriesTranslationProfile,
  selectPreviousPublishedEpisodeCandidate,
  selectSeriesTranslationGlossary,
  tailTranslationContext,
  type SeriesTranslationConsistencyContext,
  type SeriesTranslationGlossaryEntry,
  type TranslationGlossaryOrigin,
  type TranslationGlossaryStatus,
  type SeriesTranslationGlossaryTarget,
  type TranslationGlossaryTermType,
} from "@/lib/translation/seriesTranslationConsistency";

function asStatus(value: unknown): TranslationGlossaryStatus {
  if (value === "suggested" || value === "disabled") return value;
  return "confirmed";
}

function asOrigin(value: unknown): TranslationGlossaryOrigin {
  if (value === "ai" || value === "editor" || value === "system") return value;
  return "author";
}

function asTermType(value: unknown): TranslationGlossaryTermType {
  if (
    value === "character" || value === "person" || value === "place" ||
    value === "organization" || value === "item" || value === "skill" ||
    value === "magic" || value === "concept" || value === "title"
  ) return value;
  return "other";
}

function positiveEpisodeNumber(value: unknown, fallback = 1): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 1 ? Math.floor(parsed) : fallback;
}

async function resolveGlossary(args: {
  seriesId: string;
  sourceLanguage: SupportedLanguageTag;
  targetLanguage: SupportedLanguageTag;
  episodeNumber: number;
  currentSource: string;
}): Promise<SeriesTranslationConsistencyContext["glossaryTerms"]> {
  const admin = createAdminClient();
  const entriesResult = await admin
    .from("series_translation_glossary_entries")
    .select("id, source_term, term_type, source_note, effective_from_episode_number, origin, status, is_locked, is_global, updated_at")
    .eq("series_id", args.seriesId)
    .eq("source_language", args.sourceLanguage)
    .neq("status", "disabled")
    .lte("effective_from_episode_number", args.episodeNumber)
    .order("is_locked", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(500);

  if (entriesResult.error || !entriesResult.data?.length) return [];

  const entries: SeriesTranslationGlossaryEntry[] = entriesResult.data.map((row: Record<string, unknown>) => ({
    id: String(row.id),
    sourceTerm: String(row.source_term ?? "").trim(),
    termType: asTermType(row.term_type),
    sourceNote: typeof row.source_note === "string" ? row.source_note : null,
    effectiveFromEpisodeNumber: positiveEpisodeNumber(row.effective_from_episode_number),
    origin: asOrigin(row.origin),
    status: asStatus(row.status),
    isLocked: row.is_locked === true,
    isGlobal: row.is_global === true,
  }));
  const entryIds = entries.map((entry) => entry.id);
  const targetsResult = await admin
    .from("series_translation_glossary_targets")
    .select("glossary_entry_id, target_language, target_term, translation_note, effective_from_episode_number, origin, status, is_locked, updated_at")
    .in("glossary_entry_id", entryIds)
    .eq("target_language", args.targetLanguage)
    .neq("status", "disabled")
    .lte("effective_from_episode_number", args.episodeNumber)
    .order("is_locked", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(500);

  if (targetsResult.error || !targetsResult.data?.length) return [];

  const targets: SeriesTranslationGlossaryTarget[] = targetsResult.data.map((row: Record<string, unknown>) => ({
    glossaryEntryId: String(row.glossary_entry_id),
    targetLanguage: args.targetLanguage,
    targetTerm: String(row.target_term ?? "").trim(),
    translationNote: typeof row.translation_note === "string" ? row.translation_note : null,
    effectiveFromEpisodeNumber: positiveEpisodeNumber(row.effective_from_episode_number),
    origin: asOrigin(row.origin),
    status: asStatus(row.status),
    isLocked: row.is_locked === true,
  }));

  return selectSeriesTranslationGlossary({
    entries: entries.filter((entry) => entry.sourceTerm),
    targets: targets.filter((target) => target.targetTerm),
    targetLanguage: args.targetLanguage,
    episodeNumber: args.episodeNumber,
    currentSource: args.currentSource,
  });
}

async function resolveProfile(args: { seriesId: string; targetLanguage: SupportedLanguageTag }) {
  const admin = createAdminClient();
  const result = await admin
    .from("series_translation_profiles")
    .select("style_notes, honorific_policy, formatting_notes")
    .eq("series_id", args.seriesId)
    .eq("target_language", args.targetLanguage)
    .maybeSingle();
  if (result.error || !result.data) return null;
  return normalizeSeriesTranslationProfile({
    styleNotes: typeof result.data.style_notes === "string" ? result.data.style_notes : null,
    honorificPolicy: typeof result.data.honorific_policy === "string" ? result.data.honorific_policy : null,
    formattingNotes: typeof result.data.formatting_notes === "string" ? result.data.formatting_notes : null,
  });
}

async function fetchPreviousPublishedEpisode(access: EpisodeTranslationAccess): Promise<EpisodeRow | null> {
  if (getSeriesPublicationStatus(access.series) !== "public" || access.episodeNumber <= 1) return null;
  const admin = createAdminClient();
  const [postedResult, scheduledResult] = await Promise.all([
    admin.from("episodes").select("*").eq("series_id", access.seriesId).lt("episode_number", access.episodeNumber).eq("posting_status", "posted").order("episode_number", { ascending: false }).limit(1).maybeSingle(),
    admin.from("episodes").select("*").eq("series_id", access.seriesId).lt("episode_number", access.episodeNumber).eq("posting_status", "scheduled").lte("scheduled_for", new Date().toISOString()).order("episode_number", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const candidates = [
    postedResult.error ? null : ((postedResult.data as EpisodeRow | null) ?? null),
    scheduledResult.error ? null : ((scheduledResult.data as EpisodeRow | null) ?? null),
  ]
    .filter((episode): episode is EpisodeRow => Boolean(episode))
    .map((episode) => ({ episode, episodeNumber: getEpisodeNumber(episode), isPublic: isEpisodePubliclyVisible(episode) }));
  return selectPreviousPublishedEpisodeCandidate(candidates, access.episodeNumber)?.episode ?? null;
}

async function resolvePreviousEpisodeContext(args: {
  access: EpisodeTranslationAccess;
  sourceLanguage: SupportedLanguageTag;
  targetLanguage: SupportedLanguageTag;
}) {
  const previousEpisode = await fetchPreviousPublishedEpisode(args.access);
  if (!previousEpisode) return null;
  const previousBody = getEpisodeBody(previousEpisode);
  if (!previousBody.trim()) return null;
  const source = buildEpisodeTranslationSource(previousBody, args.sourceLanguage);
  const sourceTail = tailTranslationContext(source.normalizedSource);
  if (!sourceTail) return null;
  const parsedPreference = readSeriesTranslationLearningPreference(args.access.series.effect_settings ?? args.access.series.effectSettings);
  const learningPreference = parsedPreference?.language === args.targetLanguage ? parsedPreference : null;
  const sourceHash = buildEpisodeTranslationSourceHash(previousBody, learningPreference ? { learningPreference } : undefined);
  const admin = createAdminClient();
  const translationResult = await admin
    .from("episode_translations")
    .select("segments")
    .eq("episode_id", previousEpisode.id)
    .eq("source_language", args.sourceLanguage)
    .eq("target_language", args.targetLanguage)
    .eq("source_hash", sourceHash)
    .eq("status", "ready")
    .maybeSingle();

  let targetTail: string | null = null;
  if (!translationResult.error && translationResult.data?.segments) {
    const payload = parseStoredTranslationPayload(translationResult.data.segments, { sourceLanguage: args.sourceLanguage, targetLanguage: args.targetLanguage });
    if (payload) targetTail = tailTranslationContext(payload.segments.map((segment) => segment.translatedText).join("\n"));
  }
  return { episodeNumber: getEpisodeNumber(previousEpisode), sourceTail, targetTail };
}

export async function resolveSeriesTranslationConsistency(args: {
  access: EpisodeTranslationAccess;
  sourceLanguage: SupportedLanguageTag;
  targetLanguage: SupportedLanguageTag;
  currentSource: string;
}): Promise<SeriesTranslationConsistencyContext> {
  try {
    const [glossaryTerms, profile, previousEpisode] = await Promise.all([
      resolveGlossary({ seriesId: args.access.seriesId, sourceLanguage: args.sourceLanguage, targetLanguage: args.targetLanguage, episodeNumber: args.access.episodeNumber, currentSource: args.currentSource }),
      resolveProfile({ seriesId: args.access.seriesId, targetLanguage: args.targetLanguage }),
      resolvePreviousEpisodeContext({ access: args.access, sourceLanguage: args.sourceLanguage, targetLanguage: args.targetLanguage }),
    ]);
    return {
      glossaryTerms,
      profile,
      previousEpisode,
      referenceChars: countTranslationConsistencyReferenceChars({ glossaryTerms, profile, previousEpisode }),
    };
  } catch {
    return emptySeriesTranslationConsistency();
  }
}
