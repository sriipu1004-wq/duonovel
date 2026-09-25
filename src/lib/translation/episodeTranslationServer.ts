import "server-only";

import { createHash } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isOfficialAccountEmail } from "@/lib/auth/officialAccount";
import {
  getEpisodeBody,
  getEpisodeNumber,
  getSeriesPublicationStatus,
  isEpisodePubliclyVisible,
  pickText,
  type EpisodeRow,
  type SeriesRow,
} from "@/features/write/writeShared";
import { isR18Series } from "@/lib/contentRating";
import { getCurrentR18ViewerPreference } from "@/lib/contentRatingServer";
import {
  normalizeTranslationSourceText,
  segmentSourceDocument,
} from "@/lib/translation/segmentSourceDocument";
import {
  DEFAULT_TRANSLATION_SOURCE_LANGUAGE,
  DEFAULT_TRANSLATION_TARGET_LANGUAGE,
  type SupportedLanguageTag,
} from "@/lib/translation/languageRegistry";
import { inferSeriesSourceLanguage } from "@/lib/translation/seriesSourceLanguage";
import { TRANSLATION_SEGMENT_VERSION } from "@/lib/translation/translationPayload";

export const TRANSLATION_SOURCE_LANGUAGE = DEFAULT_TRANSLATION_SOURCE_LANGUAGE;
export const TRANSLATION_TARGET_LANGUAGE = DEFAULT_TRANSLATION_TARGET_LANGUAGE;
export { TRANSLATION_SEGMENT_VERSION };

const DEFAULT_PREVIEW_SERIES_EPISODE_ALLOWLIST = new Set([
  "af9f56ea-93b4-4e34-8779-89aa8758f3aa:1",
]);

export type EpisodeTranslationAccess = {
  episode: EpisodeRow;
  series: SeriesRow;
  body: string;
  sourceLanguage: SupportedLanguageTag | null;
  seriesId: string;
  episodeNumber: number;
  currentUserId: string | null;
  currentUserEmail: string | null;
  isOwner: boolean;
  isOfficialUser: boolean;
  canRead: boolean;
  isAllowlisted: boolean;
};

function parseCsv(value: string | undefined): Set<string> {
  return new Set(
    (value ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
  );
}


export function isSeriesTranslationEligible(series: SeriesRow): boolean {
  return series.translation_permission_mode === "open";
}

export async function isSeriesTranslationEligibleIncludingOfficial(
  series: SeriesRow
): Promise<boolean> {
  // Kept as an async compatibility boundary for existing callers. Official
  // authorship is not a permission override: closed always means closed.
  return isSeriesTranslationEligible(series);
}

export function isEpisodeTranslationAllowlisted(args: {
  episodeId?: string | null;
  seriesId: string;
  episodeNumber: number;
}): boolean {
  const episodeIds = parseCsv(process.env.EPISODE_TRANSLATION_ALLOWED_EPISODE_IDS);
  const seriesEpisodes = new Set([
    ...DEFAULT_PREVIEW_SERIES_EPISODE_ALLOWLIST,
    ...parseCsv(process.env.EPISODE_TRANSLATION_ALLOWED_SERIES_EPISODES),
  ]);

  if (args.episodeId && episodeIds.has(args.episodeId)) {
    return true;
  }

  return seriesEpisodes.has(args.seriesId + ":" + String(args.episodeNumber));
}

export function buildEpisodeTranslationSourceHash(
  body: string,
  cacheVariant?: unknown
): string {
  const normalized = normalizeTranslationSourceText(body);
  const variant =
    cacheVariant === undefined || cacheVariant === null
      ? ""
      : "\0variant-v1\0" + JSON.stringify(cacheVariant);
  return createHash("sha256")
    .update(
      "episode-translation-source-v2\0segment-v" +
        String(TRANSLATION_SEGMENT_VERSION) +
        "\0" +
        normalized +
        variant,
      "utf8"
    )
    .digest("hex");
}

export function buildEpisodeTranslationSource(
  body: string,
  sourceLanguage: SupportedLanguageTag = TRANSLATION_SOURCE_LANGUAGE
) {
  return segmentSourceDocument(body, sourceLanguage);
}

export async function resolveEpisodeTranslationAccess(
  episodeId: string
): Promise<EpisodeTranslationAccess | null> {
  const cleanEpisodeId = episodeId.trim();
  if (!cleanEpisodeId) return null;

  const [sessionClient, admin] = await Promise.all([
    createClient(),
    Promise.resolve(createAdminClient()),
  ]);

  const [{ data: authData }, episodeResult] = await Promise.all([
    sessionClient.auth.getUser(),
    admin.from("episodes").select("*").eq("id", cleanEpisodeId).maybeSingle(),
  ]);

  if (episodeResult.error || !episodeResult.data) {
    return null;
  }

  const episode = episodeResult.data as EpisodeRow;
  const seriesId = pickText(episode.series_id, episode.seriesId);
  if (!seriesId) return null;

  const seriesResult = await admin
    .from("series")
    .select("*")
    .eq("id", seriesId)
    .maybeSingle();

  if (seriesResult.error || !seriesResult.data) {
    return null;
  }

  const series = seriesResult.data as SeriesRow;
  const user = authData.user ?? null;
  const currentUserId = user?.id ?? null;
  const currentUserEmail = user?.email ?? null;
  const ownerId = pickText(series.author_id, series["user_id"], series["userId"]);
  const isOwner = Boolean(currentUserId && ownerId === currentUserId);
  const isPublic =
    getSeriesPublicationStatus(series) === "public" &&
    isEpisodePubliclyVisible(episode);
  const body = getEpisodeBody(episode);
  const sourceLanguage = inferSeriesSourceLanguage(series, body);
  const episodeNumber = getEpisodeNumber(episode);
  const r18Allowed =
    !isR18Series(series) ||
    (await getCurrentR18ViewerPreference()).showR18Content;

  return {
    episode,
    series,
    body,
    sourceLanguage,
    seriesId,
    episodeNumber,
    currentUserId,
    currentUserEmail,
    isOwner,
    isOfficialUser: isOfficialAccountEmail(currentUserEmail),
    canRead: (isPublic || isOwner) && r18Allowed,
    // Translation permission is authoritative. Ownership, preview allowlists,
    // AI-generated attribution, and Official authorship must never bypass a closed work.
    isAllowlisted: isSeriesTranslationEligible(series),
  };
}
