import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  getEpisodeBody,
  getEpisodeNumber,
  getSeriesPublicationStatus,
  isEpisodePubliclyVisible,
  pickText,
  type EpisodeRow,
  type SeriesRow,
} from "@/features/write/writeShared";
import { inferSeriesSourceLanguage } from "@/lib/translation/seriesSourceLanguage";
import {
  buildEpisodeTranslationSourceHash,
  isSeriesTranslationEligibleIncludingOfficial,
} from "@/lib/translation/episodeTranslationServer";
import { readSeriesTranslationLearningPreference } from "@/lib/translation/translationLearningPreference";
import {
  parseSupportedLanguageTag,
  type SupportedLanguageTag,
} from "@/lib/translation/languageRegistry";

export type PublicWorkTranslationEpisode = {
  id: string;
  episodeNumber: number;
  title: string;
  availableLanguages: SupportedLanguageTag[];
};

export type PublicWorkTranslationOverview = {
  series: SeriesRow;
  sourceLanguage: SupportedLanguageTag;
  translationEligible: boolean;
  episodes: PublicWorkTranslationEpisode[];
  availableLanguages: SupportedLanguageTag[];
};

type TranslationRow = {
  episode_id: string;
  source_language: string;
  target_language: string;
  source_hash: string;
  status: string;
};

async function fetchSeriesEpisodes(
  admin: ReturnType<typeof createAdminClient>,
  seriesId: string
): Promise<EpisodeRow[]> {
  const firstTry = await admin
    .from("episodes")
    .select("*")
    .eq("series_id", seriesId);
  if (!firstTry.error) return (firstTry.data ?? []) as EpisodeRow[];

  const secondTry = await admin
    .from("episodes")
    .select("*")
    .eq("seriesId", seriesId);
  return secondTry.error ? [] : ((secondTry.data ?? []) as EpisodeRow[]);
}

export async function getPublicWorkTranslationOverview(
  seriesId: string
): Promise<PublicWorkTranslationOverview | null> {
  const cleanSeriesId = seriesId.trim();
  if (!cleanSeriesId) return null;

  const admin = createAdminClient();
  const seriesResult = await admin
    .from("series")
    .select("*")
    .eq("id", cleanSeriesId)
    .maybeSingle();
  if (seriesResult.error || !seriesResult.data) return null;

  const series = seriesResult.data as SeriesRow;
  if (getSeriesPublicationStatus(series) !== "public") return null;

  const episodes = (await fetchSeriesEpisodes(admin, cleanSeriesId))
    .filter((episode) => isEpisodePubliclyVisible(episode))
    .sort((left, right) => getEpisodeNumber(left) - getEpisodeNumber(right));
  if (episodes.length === 0) return null;

  const firstBody = getEpisodeBody(episodes[0]);
  const sourceLanguage = inferSeriesSourceLanguage(series, firstBody);
  if (!sourceLanguage) return null;

  const translationEligible =
    await isSeriesTranslationEligibleIncludingOfficial(series);
  const availableByEpisode = new Map<string, Set<SupportedLanguageTag>>();

  if (translationEligible) {
    const episodeIds = episodes.map((episode) => episode.id).filter(Boolean);
    const translationResult = await admin
      .from("episode_translations")
      .select("episode_id, source_language, target_language, source_hash, status")
      .in("episode_id", episodeIds)
      .eq("source_language", sourceLanguage)
      .eq("status", "ready");

    const rows = translationResult.error
      ? []
      : ((translationResult.data ?? []) as TranslationRow[]);
    const learningPreference = readSeriesTranslationLearningPreference(
      series.effect_settings ?? series.effectSettings
    );

    for (const episode of episodes) {
      const body = getEpisodeBody(episode);
      const episodeRows = rows.filter((row) => row.episode_id === episode.id);
      const languages = new Set<SupportedLanguageTag>();

      for (const row of episodeRows) {
        const targetLanguage = parseSupportedLanguageTag(row.target_language);
        if (!targetLanguage || targetLanguage === sourceLanguage) continue;
        const effectiveLearningPreference =
          learningPreference?.language === targetLanguage
            ? learningPreference
            : null;
        const expectedHash = buildEpisodeTranslationSourceHash(
          body,
          effectiveLearningPreference
            ? { learningPreference: effectiveLearningPreference }
            : undefined
        );
        if (row.source_hash === expectedHash) languages.add(targetLanguage);
      }

      availableByEpisode.set(episode.id, languages);
    }
  }

  const publicEpisodes = episodes.map((episode) => ({
    id: episode.id,
    episodeNumber: getEpisodeNumber(episode),
    title:
      pickText(episode.title, episode["episode_title"]) ||
      `第${getEpisodeNumber(episode)}話`,
    availableLanguages: Array.from(
      availableByEpisode.get(episode.id) ?? []
    ),
  }));
  const allLanguages = Array.from(
    new Set(publicEpisodes.flatMap((episode) => episode.availableLanguages))
  );

  return {
    series,
    sourceLanguage,
    translationEligible,
    episodes: publicEpisodes,
    availableLanguages: allLanguages,
  };
}
