import { unstable_cache } from "next/cache";
import { headers } from "next/headers";
import { createPublicServerClient } from "@/lib/supabase/serverPublic";
import {
  getEpisodeBody,
  getEpisodeNumber,
  getEpisodePostedAtValue,
  getSeriesGenres,
  getSeriesPublicationStatus,
  getSeriesSummary,
  isEpisodePubliclyVisible,
  pickText,
  sortEpisodes,
  type EpisodeRow,
  type SeriesRow,
} from "@/features/write/writeShared";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getSeriesContentRating,
  withSystemContentRatingTag,
  type SeriesContentRating,
} from "@/lib/contentRating";
import { getCurrentR18ViewerPreference } from "@/lib/contentRatingServer";
import { DEFAULT_UI_LOCALE, isUiLocale, UI_LOCALE_HEADER } from "@/i18n/config";
import {
  CONTENT_LANGUAGE_FILTER_HEADER,
  detectContentLanguage,
  parseContentLanguageList,
  type ContentLanguage,
} from "@/i18n/contentLanguage";
import {
  inferSeriesSourceLanguage,
  readCanonicalSeriesSourceLanguage,
  sourceLanguageToContentLanguage,
} from "@/lib/translation/seriesSourceLanguage";
import type { SupportedLanguageTag } from "@/lib/translation/languageRegistry";
import { isSeriesTranslationEligible } from "@/lib/translation/episodeTranslationServer";
import { isOfficialAccountEmail } from "@/lib/auth/officialAccount";
import { matchesPublicWorkLanguageFilters } from "@/lib/search/publicWorkLanguageFilter";
import { getPublicSearchLanguageFilters } from "@/lib/search/publicSearchRequestContext";
import { PUBLIC_RECORDING_AGGREGATE_SELECT } from "@/lib/recording/publicRecordingSelects";
import { isPublishedHumanRecording } from "@/lib/recording/humanRecordingState";
import { readPublicDomainMetadata } from "@/lib/publicDomainMetadata";

export type PublicBaseWorkCard = {
  seriesId: string;
  title: string;
  summary: string;
  authorName: string;
  authorId: string | null;
  episodeCount: number;
  firstEpisodeNumber: number | null;
  latestPostedLabel: string;
  latestPostedAtValue: number;
  earliestPublicAtValue: number;
  createdAtValue: number;
  tags: string[];
  genres: string[];
  contentRating: SeriesContentRating;
  contentLanguage: ContentLanguage;
  sourceLanguage: SupportedLanguageTag | null;
  translationEligible: boolean;
  isShortStory: boolean;
  publicEpisodeNumbers: number[];
  publicDomainRightsChecked?: boolean;
  publicDomainSourceProvider?: string | null;
  publicDomainSourceUrl?: string | null;
  publicDomainFirstPublicationYear?: number | null;
};

export type PublicWorkVisibility = "viewer" | "general" | "all";

type PublicAuthorAccount = {
  displayName: string;
  isOfficial: boolean;
};

function formatDate(value: string | null | undefined): string {
  if (!value) return "日付未設定";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "日付未設定";
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Tokyo",
  }).format(parsed);
}

function toTimeValue(value: unknown): number {
  if (typeof value !== "string" || value.trim().length === 0) return 0;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

function parseTagList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item).trim())
      .filter((item) => item.length > 0)
      .map((item) => (item.startsWith("#") ? item : `#${item}`));
  }
  if (typeof value === "string" && value.trim().length > 0) {
    return value
      .split(/[,、\s]+/)
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
      .map((item) => (item.startsWith("#") ? item : `#${item}`));
  }
  return [];
}

function getSeriesTags(series: SeriesRow): string[] {
  const candidates = [series["tags"], series["tag_list"], series["tagList"]];
  for (const candidate of candidates) {
    const parsed = parseTagList(candidate);
    if (parsed.length > 0) return parsed;
  }
  return [];
}

function getEpisodeSeriesId(episode: EpisodeRow): string {
  const row = episode as Record<string, unknown>;
  return pickText(row["series_id"], row["seriesId"]);
}

function readEffectSettings(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object") return value as Record<string, unknown>;
  if (typeof value !== "string" || value.trim().length === 0) return null;
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
  return null;
}

function isShortStorySeriesForSitemap(series: SeriesRow): boolean {
  const effectSettings = series["effect_settings"] ?? series["effectSettings"];
  if (readPublicDomainMetadata(effectSettings)) return false;
  const tags = getSeriesTags(series);
  const settings = readEffectSettings(effectSettings);
  return (
    tags.includes("#AI生成") ||
    settings?.source === "time_fit_ai_story" ||
    settings?.aiGenerated === true ||
    settings?.authorName === "AI生成" ||
    settings?.storyFormat === "short"
  );
}

async function fetchPublicSeriesRows(): Promise<SeriesRow[]> {
  const supabase = createPublicServerClient();
  const PAGE_SIZE = 1000;
  const rows: SeriesRow[] = [];

  for (let start = 0; ; start += PAGE_SIZE) {
    const result = await supabase
      .from("series")
      // The production schema has evolved several times. Selecting the full row
      // keeps public discovery compatible while the card builder intentionally
      // reads only the fields it needs below.
      .select("*")
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .range(start, start + PAGE_SIZE - 1);

    if (result.error) {
      throw new Error(`series の取得に失敗: ${result.error.message}`);
    }

    const pageRows = (result.data ?? []) as SeriesRow[];
    rows.push(...pageRows);

    if (pageRows.length < PAGE_SIZE) {
      break;
    }
  }

  return rows.filter(
    (series) => getSeriesPublicationStatus(series) === "public"
  );
}

async function fetchEpisodesBySeriesIds(seriesIds: string[]): Promise<Map<string, EpisodeRow[]>> {
  const supabase = createPublicServerClient();
  if (seriesIds.length === 0) return new Map();

  const PAGE_SIZE = 1000;

  async function fetchPaged(selectClause: string) {
    const rows: EpisodeRow[] = [];

    for (let start = 0; ; start += PAGE_SIZE) {
      const result = await supabase
        .from("episodes")
        .select(selectClause)
        .in("series_id", seriesIds)
        .order("series_id", { ascending: true })
        .order("episode_number", { ascending: true })
        .order("id", { ascending: true })
        .range(start, start + PAGE_SIZE - 1);

      if (result.error) {
        return { rows: [] as EpisodeRow[], error: result.error };
      }

      const pageRows = (result.data ?? []) as unknown as EpisodeRow[];
      rows.push(...pageRows);

      if (pageRows.length < PAGE_SIZE) {
        break;
      }
    }

    return { rows, error: null };
  }

  let fetched = await fetchPaged(PUBLIC_WORK_EPISODE_SELECT);
  if (fetched.error) {
    fetched = await fetchPaged("*");
  }
  if (fetched.error) {
    throw new Error(`episodes の取得に失敗: ${fetched.error.message}`);
  }

  const episodes = fetched.rows;
  const grouped = new Map<string, EpisodeRow[]>();
  for (const episode of episodes) {
    const seriesId = getEpisodeSeriesId(episode);
    if (!seriesId) continue;
    const current = grouped.get(seriesId) ?? [];
    current.push(episode);
    grouped.set(seriesId, current);
  }
  for (const [seriesId, list] of grouped.entries()) {
    grouped.set(seriesId, sortEpisodes(list.filter((episode) => isEpisodePubliclyVisible(episode))));
  }
  return grouped;
}

async function fetchEpisodeBodyMapByIds(
  episodeIds: string[]
): Promise<Map<string, string>> {
  const ids = Array.from(new Set(episodeIds.filter(Boolean)));
  if (ids.length === 0) return new Map();

  const supabase = createPublicServerClient();
  const narrow = await supabase
    .from("episodes")
    .select("id, body")
    .in("id", ids);
  const rows = !narrow.error
    ? ((narrow.data ?? []) as EpisodeRow[])
    : (((await supabase.from("episodes").select("*").in("id", ids)).data ?? []) as EpisodeRow[]);

  return new Map(
    rows.map((episode) => [episode.id, getEpisodeBody(episode)] as const)
  );
}

function readAuthAccountDisplayName(metadata: unknown): string {
  if (!metadata || typeof metadata !== "object") return "";
  const record = metadata as Record<string, unknown>;
  return pickPublicAuthorName(record.display_name_candidate, record.display_name);
}

async function fetchAuthorAccountMap(authorIds: string[]): Promise<Map<string, PublicAuthorAccount>> {
  if (authorIds.length === 0) return new Map();
  const adminSupabase = createAdminClient();
  const result = new Map<string, PublicAuthorAccount>();

  await Promise.all(
    authorIds.map(async (authorId) => {
      const { data, error } = await adminSupabase.auth.admin.getUserById(authorId);
      if (error || !data?.user) return;
      result.set(authorId, {
        displayName: readAuthAccountDisplayName(data.user.user_metadata),
        isOfficial: isOfficialAccountEmail(data.user.email),
      });
    })
  );
  return result;
}

async function buildPublicBaseWorkCards(): Promise<PublicBaseWorkCard[]> {
  const publicSeries = await fetchPublicSeriesRows();
  if (publicSeries.length === 0) return [];

  const authorIds = Array.from(
    new Set(
      publicSeries
        .map((series) => pickText(series.author_id, series["user_id"], series["userId"]))
        .filter((value): value is string => !!value)
    )
  );

  const [authorAccountMap, episodesBySeriesId] = await Promise.all([
    fetchAuthorAccountMap(authorIds),
    fetchEpisodesBySeriesIds(publicSeries.map((series) => series.id)),
  ]);

  const legacyFirstEpisodeIds = publicSeries
    .filter((series) => !readCanonicalSeriesSourceLanguage(series))
    .map((series) => episodesBySeriesId.get(series.id)?.[0]?.id ?? "")
    .filter((episodeId) => episodeId.length > 0);
  const legacyFirstEpisodeBodyMap = await fetchEpisodeBodyMapByIds(
    legacyFirstEpisodeIds
  );

  return publicSeries
    .map((series) => {
      const publicEpisodes = episodesBySeriesId.get(series.id) ?? [];
      if (publicEpisodes.length === 0) return null;

      const firstEpisode = publicEpisodes[0] ?? null;
      const latestEpisode = publicEpisodes[publicEpisodes.length - 1] ?? null;
      const authorId = pickText(series.author_id, series["user_id"], series["userId"]) || null;
      const authorAccount = authorId ? authorAccountMap.get(authorId) : undefined;
      const publicDomain = readPublicDomainMetadata(
        series["effect_settings"] ?? series["effectSettings"]
      );
      const latestPostedRaw = latestEpisode ? getEpisodePostedAtValue(latestEpisode) : null;
      const firstPostedRaw = firstEpisode ? getEpisodePostedAtValue(firstEpisode) : null;
      const latestPostedAtValue = latestPostedRaw ? new Date(latestPostedRaw).getTime() : 0;
      const firstPostedAtValue = firstPostedRaw ? new Date(firstPostedRaw).getTime() : 0;
      const createdAtValue = toTimeValue(series["created_at"]);
      const contentRating = getSeriesContentRating(series);
      const title = pickText(series.title) || "無題";
      const summary = getSeriesSummary(series) || "あらすじはまだ登録されていません。";
      const canonicalSourceLanguage = readCanonicalSeriesSourceLanguage(series);
      const sourceLanguage = inferSeriesSourceLanguage(
        series,
        firstEpisode ? legacyFirstEpisodeBodyMap.get(firstEpisode.id) : null
      );

      return {
        seriesId: series.id,
        title,
        summary,
        authorName: publicDomain?.originalAuthor || authorAccount?.displayName || "作者名未設定",
        authorId: publicDomain ? null : authorId,
        episodeCount: publicEpisodes.length,
        firstEpisodeNumber: firstEpisode ? getEpisodeNumber(firstEpisode) : null,
        latestPostedLabel: formatDate(latestPostedRaw),
        latestPostedAtValue,
        earliestPublicAtValue: firstPostedAtValue > 0 ? firstPostedAtValue : createdAtValue,
        createdAtValue,
        contentRating,
        contentLanguage: canonicalSourceLanguage
          ? sourceLanguageToContentLanguage(canonicalSourceLanguage)
          : detectContentLanguage(title, summary),
        sourceLanguage,
        translationEligible:
          isSeriesTranslationEligible(series) || authorAccount?.isOfficial === true,
        isShortStory: isShortStorySeriesForSitemap(series),
        publicEpisodeNumbers: publicEpisodes
          .map((episode) => getEpisodeNumber(episode))
          .filter((episodeNumber) => episodeNumber > 0),
        publicDomainRightsChecked: publicDomain?.rightsChecked === true,
        publicDomainSourceProvider: publicDomain?.sourceProvider ?? null,
        publicDomainSourceUrl: publicDomain?.sourceUrl ?? null,
        publicDomainFirstPublicationYear: publicDomain?.firstPublicationYear ?? null,
        tags: withSystemContentRatingTag(getSeriesTags(series), contentRating),
        genres: getSeriesGenres(series),
      } satisfies PublicBaseWorkCard;
    })
    .filter((card): card is NonNullable<typeof card> => card !== null)
    .sort((a, b) => {
      if (b.latestPostedAtValue !== a.latestPostedAtValue) return b.latestPostedAtValue - a.latestPostedAtValue;
      return b.createdAtValue - a.createdAtValue;
    });
}

const getCachedPublicBaseWorkCardsInternal = unstable_cache(
  buildPublicBaseWorkCards,
  ["public-base-work-cards-v9-paginated"],
  { revalidate: 60 }
);

function prioritizeForLocale(cards: PublicBaseWorkCard[], locale: "ja" | "en" | "ko"): PublicBaseWorkCard[] {
  return cards
    .map((card, index) => ({ card, index }))
    .sort((a, b) => {
      const aPriority = a.card.contentLanguage === locale ? 0 : 1;
      const bPriority = b.card.contentLanguage === locale ? 0 : 1;
      if (aPriority !== bPriority) return aPriority - bPriority;
      return a.index - b.index;
    })
    .map(({ card }) => card);
}

export async function getCachedPublicBaseWorkCards(options?: {
  visibility?: PublicWorkVisibility;
  ignoreContentLanguageFilter?: boolean;
  prioritizeForUiLocale?: boolean;
}): Promise<PublicBaseWorkCard[]> {
  const cards = await getCachedPublicBaseWorkCardsInternal();
  const visibility = options?.visibility ?? "viewer";

  if (visibility === "all") return cards;
  if (visibility === "general") return cards.filter((card) => card.contentRating !== "r18");

  const preference = await getCurrentR18ViewerPreference();
  let visibleCards = preference.showR18Content
    ? cards
    : cards.filter((card) => card.contentRating !== "r18");

  const requestHeaders = await headers();
  const headerLocale = requestHeaders.get(UI_LOCALE_HEADER);
  const locale = isUiLocale(headerLocale) ? headerLocale : DEFAULT_UI_LOCALE;

  if (!options?.ignoreContentLanguageFilter) {
    const selectedLanguages = parseContentLanguageList(
      requestHeaders.get(CONTENT_LANGUAGE_FILTER_HEADER)
    );
    if (selectedLanguages.length > 0) {
      const selectedSet = new Set(selectedLanguages);
      visibleCards = visibleCards.filter((card) => selectedSet.has(card.contentLanguage));
    }
  }

  const searchLanguageFilters = getPublicSearchLanguageFilters();
  if (searchLanguageFilters?.sourceLanguages.length) {
    visibleCards = visibleCards.filter((work) =>
      matchesPublicWorkLanguageFilters({
        work,
        sourceLanguages: searchLanguageFilters.sourceLanguages,
      })
    );
  }

  return options?.prioritizeForUiLocale === false
    ? visibleCards
    : prioritizeForLocale(visibleCards, locale);
}

type RecordingAggregateRow = Record<string, unknown> & {
  id?: string | null;
  series_id?: string | null;
  seriesId?: string | null;
  like_count?: number | null;
  likes_count?: number | null;
  play_count?: number | null;
  plays_count?: number | null;
  is_public?: boolean | null;
  public?: boolean | null;
  reader_id?: string | null;
  reader_user_id?: string | null;
  reader_name?: string | null;
  audio_storage_path?: string | null;
  voice_model_id?: string | null;
};

export type PublicRecordingAggregate = {
  seriesId: string;
  totalRecordingLikes: number;
  totalRecordingPlays: number;
  totalRecordingCount: number;
};

const PUBLIC_WORK_EPISODE_SELECT = `
  id,
  series_id,
  episode_number,
  posting_status,
  scheduled_for,
  posted_at
`;


function isEmailLike(value: unknown): boolean {
  if (typeof value !== "string") return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function pickPublicAuthorName(...values: unknown[]): string {
  for (const value of values) {
    const text = pickText(value);
    if (!text) continue;
    if (isEmailLike(text)) continue;
    return text;
  }
  return "";
}

function getRecordingLikes(recording: RecordingAggregateRow): number {
  const raw = recording.like_count ?? recording.likes_count ?? 0;
  if (typeof raw === "number") return raw;
  const parsed = Number(raw);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function getRecordingPlays(recording: RecordingAggregateRow): number {
  const raw = recording.play_count ?? recording.plays_count ?? 0;
  if (typeof raw === "number") return raw;
  const parsed = Number(raw);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function getRecordingSeriesId(recording: RecordingAggregateRow): string {
  return pickText(recording.series_id, recording.seriesId);
}

function normalizeSeriesIds(seriesIds?: string[]): string[] {
  return Array.from(
    new Set((seriesIds ?? []).map((value) => value.trim()).filter((value) => value.length > 0))
  ).sort((left, right) => left.localeCompare(right));
}

async function buildPublicRecordingAggregates(seriesIds?: string[]): Promise<PublicRecordingAggregate[]> {
  const supabase = createAdminClient();
  const normalizedSeriesIds = normalizeSeriesIds(seriesIds);
  let data: RecordingAggregateRow[] = [];

  if (normalizedSeriesIds.length > 0) {
    const narrow = await supabase
      .from("recordings")
      .select(PUBLIC_RECORDING_AGGREGATE_SELECT)
      .in("series_id", normalizedSeriesIds);

    if (!narrow.error) {
      data = (narrow.data ?? []) as RecordingAggregateRow[];
    } else {
      const fallback = await supabase
        .from("recordings")
        .select("*")
        .in("series_id", normalizedSeriesIds);
      if (fallback.error) {
        throw new Error(`recordings の取得に失敗: ${fallback.error.message}`);
      }
      data = (fallback.data ?? []) as RecordingAggregateRow[];
    }
  } else {
    const narrow = await supabase.from("recordings").select(PUBLIC_RECORDING_AGGREGATE_SELECT);
    if (!narrow.error) {
      data = (narrow.data ?? []) as RecordingAggregateRow[];
    } else {
      const fallback = await supabase.from("recordings").select("*");
      if (fallback.error) throw new Error(`recordings の取得に失敗: ${fallback.error.message}`);
      data = (fallback.data ?? []) as RecordingAggregateRow[];
    }
  }

  const aggregateMap = new Map<
    string,
    { totalRecordingLikes: number; totalRecordingPlays: number; totalRecordingCount: number }
  >();

  for (const rawRecording of data) {
    if (!isPublishedHumanRecording(rawRecording)) continue;
    const seriesId = getRecordingSeriesId(rawRecording);
    if (!seriesId) continue;

    const current = aggregateMap.get(seriesId) ?? {
      totalRecordingLikes: 0,
      totalRecordingPlays: 0,
      totalRecordingCount: 0,
    };
    current.totalRecordingLikes += getRecordingLikes(rawRecording);
    current.totalRecordingPlays += getRecordingPlays(rawRecording);
    current.totalRecordingCount += 1;
    aggregateMap.set(seriesId, current);
  }

  return Array.from(aggregateMap.entries()).map(([seriesId, aggregate]) => ({
    seriesId,
    totalRecordingLikes: aggregate.totalRecordingLikes,
    totalRecordingPlays: aggregate.totalRecordingPlays,
    totalRecordingCount: aggregate.totalRecordingCount,
  }));
}

const getCachedPublicRecordingAggregatesInternal = unstable_cache(
  async (seriesIdsKey: string) => {
    const seriesIds = seriesIdsKey.trim().length > 0
      ? seriesIdsKey.split(",").map((value) => value.trim()).filter((value) => value.length > 0)
      : [];
    return buildPublicRecordingAggregates(seriesIds);
  },
  ["public-recording-aggregates"],
  { revalidate: 60 }
);

export async function getCachedPublicRecordingAggregates(
  seriesIds?: string[]
): Promise<PublicRecordingAggregate[]> {
  const normalizedSeriesIds = normalizeSeriesIds(seriesIds);
  return getCachedPublicRecordingAggregatesInternal(normalizedSeriesIds.join(","));
}
