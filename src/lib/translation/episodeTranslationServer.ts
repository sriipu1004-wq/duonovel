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
import { TRANSLATION_SEGMENT_VERSION } from "@/lib/translation/translationPayload";

export const TRANSLATION_SOURCE_LANGUAGE = DEFAULT_TRANSLATION_SOURCE_LANGUAGE;
export const TRANSLATION_TARGET_LANGUAGE = DEFAULT_TRANSLATION_TARGET_LANGUAGE;
export { TRANSLATION_SEGMENT_VERSION };

const DEFAULT_PREVIEW_SERIES_EPISODE_ALLOWLIST = new Set([
  "af9f56ea-93b4-4e34-8779-89aa8758f3aa:1",
]);

type AdminSupabase = ReturnType<typeof createAdminClient>;

export type EpisodeTranslationAccess = {
  episode: EpisodeRow;
  series: SeriesRow;
  body: string;
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

function parseRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object") {
    return value as Record<string, unknown>;
  }

  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object"
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }

  return null;
}

function parseTags(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(/[\n,、]/u)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

export function isSeriesAiGenerated(series: SeriesRow): boolean {
  const settings = parseRecord(series.effect_settings ?? series.effectSettings);
  const tags = parseTags(series.tags);

  return (
    tags.includes("AI生成") ||
    settings?.source === "time_fit_ai_story" ||
    settings?.aiGenerated === true ||
    settings?.authorName === "AI生成"
  );
}

export function isSeriesTranslationEligible(series: SeriesRow): boolean {
  if (isSeriesAiGenerated(series)) {
    return true;
  }

  return series.translation_permission_mode === "open";
}

async function isSeriesOfficialAuthoredWithAdmin(
  series: SeriesRow,
  admin: AdminSupabase
): Promise<boolean> {
  const ownerId = pickText(series.author_id, series["user_id"], series["userId"]);
  if (!ownerId) return false;

  try {
    const { data, error } = await admin.auth.admin.getUserById(ownerId);
    if (error || !data.user) return false;
    return isOfficialAccountEmail(data.user.email);
  } catch {
    return false;
  }
}

export async function isSeriesTranslationEligibleIncludingOfficial(
  series: SeriesRow
): Promise<boolean> {
  if (isSeriesTranslationEligible(series)) {
    return true;
  }

  return isSeriesOfficialAuthoredWithAdmin(series, createAdminClient());
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

export function buildEpisodeTranslationSourceHash(body: string): string {
  const normalized = normalizeTranslationSourceText(body);
  return createHash("sha256")
    .update("episode-translation-source-v1\0" + normalized, "utf8")
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
  const episodeNumber = getEpisodeNumber(episode);
  const explicitlyAllowlisted = isEpisodeTranslationAllowlisted({
    episodeId: episode.id,
    seriesId,
    episodeNumber,
  });
  const isOfficialAuthored = await isSeriesOfficialAuthoredWithAdmin(series, admin);
  const r18Allowed =
    !isR18Series(series) ||
    (await getCurrentR18ViewerPreference()).showR18Content;

  return {
    episode,
    series,
    body,
    seriesId,
    episodeNumber,
    currentUserId,
    currentUserEmail,
    isOwner,
    isOfficialUser: isOfficialAccountEmail(currentUserEmail),
    canRead: (isPublic || isOwner) && r18Allowed,
    isAllowlisted:
      explicitlyAllowlisted ||
      isSeriesTranslationEligible(series) ||
      isOfficialAuthored,
  };
}
