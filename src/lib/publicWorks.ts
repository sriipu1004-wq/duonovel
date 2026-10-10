import { unstable_cache } from "next/cache";
import { headers } from "next/headers";
import { createPublicServerClient } from "@/lib/supabase/serverPublic";
import {
  getEpisodeNumber,
  getEpisodePostedAtValue,
  getSeriesGenres,
  getSeriesPublicationStatus,
  getSeriesSummary,
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
  parseContentLanguageList,
  type ContentLanguage,
} from "@/i18n/contentLanguage";
import {
  readCanonicalSeriesSourceLanguage,
  sourceLanguageToContentLanguage,
} from "@/lib/translation/seriesSourceLanguage";
import type { SupportedLanguageTag } from "@/lib/translation/languageRegistry";
import { isSeriesTranslationEligible } from "@/lib/translation/episodeTranslationServer";
import { matchesPublicWorkLanguageFilters } from "@/lib/search/publicWorkLanguageFilter";
import { getPublicSearchLanguageFilters } from "@/lib/search/publicSearchRequestContext";
import { PUBLIC_RECORDING_AGGREGATE_SELECT } from "@/lib/recording/publicRecordingSelects";
import { isPublishedHumanRecording } from "@/lib/recording/humanRecordingState";
import { readPublicDomainMetadata } from "@/lib/publicDomainMetadata";
import { isSchemaCompatibilityReadFailure } from "@/lib/reliability/readOnly";

export type PublicBaseWorkCard = {
  seriesId: string;
  title: string;
  originalTitle: string | null;
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

type PublicEpisodeWorkSummary = {
  series_id: string;
  episode_count: number;
  first_episode_id: string;
  first_episode_number: number;
  first_posted_at: string | null;
  latest_posted_at: string | null;
  public_episode_numbers: number[];
};

export type PublicWorkVisibility = "viewer" | "general" | "all";

type PublicAuthorAccount = {
  displayName: string;
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
  const settings = readEffectSettings(effectSettings);
  return settings?.storyFormat === "short";
}

const PUBLIC_WORK_SERIES_SELECT = `
  id,
  author_id,
  title,
  description,
  created_at,
  tags,
  effect_settings,
  publication_status,
  genres,
  content_rating,
  content_warnings,
  source_language,
  translation_permission_mode
`;

async function fetchPublicSeriesRows(): Promise<SeriesRow[]> {
  const supabase = createPublicServerClient();
  const PAGE_SIZE = 1000;
  const rows: SeriesRow[] = [];

  async function fetchPage(start: number, selectClause: string) {
    return supabase
      .from("series")
      .select(selectClause)
      .eq("publication_status", "public")
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .range(start, start + PAGE_SIZE - 1);
  }

  for (let start = 0; ; start += PAGE_SIZE) {
    let result = await fetchPage(start, PUBLIC_WORK_SERIES_SELECT);
    if (result.error && isSchemaCompatibilityReadFailure(result.error)) {
      result = await fetchPage(start, "*");
    }
    if (result.error) {
      throw new Error(`series の取得に失敗: ${result.error.message}`);
    }

    const pageRows = (result.data ?? []) as unknown as SeriesRow[];
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
        .eq("posting_status", "posted")
        .eq("is_published", true)
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
  if (fetched.error && isSchemaCompatibilityReadFailure(fetched.error)) {
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
    grouped.set(seriesId, sortEpisodes(list));
  }
  return grouped;
}

function isMissingEpisodeSummaryView(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as Record<string, unknown>;
  const code = typeof record.code === "string" ? record.code : "";
  const message = typeof record.message === "string" ? record.message : "";
  return (
    (code === "PGRST205" || code === "42P01") &&
    message.includes("public_episode_work_summaries")
  );
}

function summarizeLegacyEpisodes(
  episodesBySeriesId: Map<string, EpisodeRow[]>
): Map<string, PublicEpisodeWorkSummary> {
  const summaries = new Map<string, PublicEpisodeWorkSummary>();
  for (const [seriesId, episodes] of episodesBySeriesId) {
    if (episodes.length === 0) continue;
    const first = episodes[0];
    const latest = episodes[episodes.length - 1];
    summaries.set(seriesId, {
      series_id: seriesId,
      episode_count: episodes.length,
      first_episode_id: first.id,
      first_episode_number: getEpisodeNumber(first),
      first_posted_at: getEpisodePostedAtValue(first) || null,
      latest_posted_at: getEpisodePostedAtValue(latest) || null,
      public_episode_numbers: episodes.map(getEpisodeNumber).filter((n) => n > 0),
    });
  }
  return summaries;
}

async function fetchPublicEpisodeSummariesBySeriesIds(
  seriesIds: string[]
): Promise<Map<string, PublicEpisodeWorkSummary>> {
  if (seriesIds.length === 0) return new Map();
  const supabase = createPublicServerClient();
  const PAGE_SIZE = 1000;
  const summaries = new Map<string, PublicEpisodeWorkSummary>();

  for (let start = 0; ; start += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("public_episode_work_summaries")
      .select(
        "series_id, episode_count, first_episode_id, first_episode_number, first_posted_at, latest_posted_at, public_episode_numbers"
      )
      .in("series_id", seriesIds)
      .order("series_id", { ascending: true })
      .range(start, start + PAGE_SIZE - 1);

    if (error) {
      // Preview / rollout environments may not have the approved migration yet.
      // Do not fall back on transient DB timeouts or permission failures.
      if (start === 0 && isMissingEpisodeSummaryView(error)) {
        return summarizeLegacyEpisodes(await fetchEpisodesBySeriesIds(seriesIds));
      }
      throw new Error(`public episode summaries の取得に失敗: ${error.message}`);
    }

    const rows = (data ?? []) as PublicEpisodeWorkSummary[];
    for (const summary of rows) {
      if (seriesIds.includes(summary.series_id)) {
        summaries.set(summary.series_id, summary);
      }
    }
    if (rows.length < PAGE_SIZE) break;
  }

  return summaries;
}

async function fetchAuthorAccountMap(authorIds: string[]): Promise<Map<string, PublicAuthorAccount>> {
  if (authorIds.length === 0) return new Map();

  const adminSupabase = createAdminClient();
  const { data, error } = await adminSupabase
    .from("users")
    .select("id, display_name")
    .in("id", authorIds);

  if (error) {
    console.warn("[public-works] author profiles unavailable", error.message);
    return new Map();
  }

  return new Map(
    ((data ?? []) as Array<{ id: string; display_name?: string | null }>)
      .map((row) => [
        row.id,
        { displayName: pickPublicAuthorName(row.display_name) },
      ] as const)
  );
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

  const [authorAccountMap, summariesBySeriesId] = await Promise.all([
    fetchAuthorAccountMap(authorIds),
    fetchPublicEpisodeSummariesBySeriesIds(publicSeries.map((series) => series.id)),
  ]);

  return publicSeries
    .map((series) => {
      const episodeSummary = summariesBySeriesId.get(series.id);
      if (!episodeSummary || episodeSummary.episode_count === 0) return null;
      // The public catalog uses canonical source language only. Never infer
      // a new public work's language from its title, summary or episode body.
      const canonicalSourceLanguage = readCanonicalSeriesSourceLanguage(series);
      if (!canonicalSourceLanguage) return null;
      const authorId = pickText(series.author_id, series["user_id"], series["userId"]) || null;
      const authorAccount = authorId ? authorAccountMap.get(authorId) : undefined;
      const publicDomain = readPublicDomainMetadata(
        series["effect_settings"] ?? series["effectSettings"]
      );
      const latestPostedRaw = episodeSummary.latest_posted_at;
      const firstPostedRaw = episodeSummary.first_posted_at;
      const latestPostedAtValue = latestPostedRaw ? new Date(latestPostedRaw).getTime() : 0;
      const firstPostedAtValue = firstPostedRaw ? new Date(firstPostedRaw).getTime() : 0;
      const createdAtValue = toTimeValue(series["created_at"]);
      const contentRating = getSeriesContentRating(series);
      const title = pickText(series.title) || "無題";
      const summary = getSeriesSummary(series) || "あらすじはまだ登録されていません。";


      return {
        seriesId: series.id,
        title,
        originalTitle: publicDomain?.originalTitle ?? null,
        summary,
        authorName: publicDomain?.originalAuthor || authorAccount?.displayName || "作者名未設定",
        authorId: publicDomain ? null : authorId,
        episodeCount: episodeSummary.episode_count,
        firstEpisodeNumber: episodeSummary.first_episode_number,
        latestPostedLabel: formatDate(latestPostedRaw),
        latestPostedAtValue,
        earliestPublicAtValue: firstPostedAtValue > 0 ? firstPostedAtValue : createdAtValue,
        createdAtValue,
        contentRating,
        contentLanguage: sourceLanguageToContentLanguage(canonicalSourceLanguage),
        sourceLanguage: canonicalSourceLanguage,
        translationEligible: isSeriesTranslationEligible(series),
        isShortStory: isShortStorySeriesForSitemap(series),
        publicEpisodeNumbers: episodeSummary.public_episode_numbers,
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
  ["public-base-work-cards-v12-canonical-source-language"],
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
  ignorePublicSearchLanguageFilter?: boolean;
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
  if (
    !options?.ignorePublicSearchLanguageFilter &&
    searchLanguageFilters?.sourceLanguages.length
  ) {
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

const PUBLIC_HUMAN_RECORDING_PAGE_SIZE = 1000;

async function buildPublicRecordingAggregates(seriesIds?: string[]): Promise<PublicRecordingAggregate[]> {
  const supabase = createAdminClient();
  const normalizedSeriesIds = normalizeSeriesIds(seriesIds);
  const data: RecordingAggregateRow[] = [];

  // isPublishedHumanRecording requires is_public=true and no voice_model_id.
  // Push both *necessary* conditions into SQL, but retain the complete
  // audio-path/reader provenance check below. Production has UUID
  // voice_model_id, so NULL cannot conceal an empty-string model ID.
  async function fetchPage(start: number, selectClause: string) {
    let query = supabase
      .from("recordings")
      .select(selectClause)
      .eq("is_public", true)
      .is("voice_model_id", null);
    if (normalizedSeriesIds.length > 0) {
      query = query.in("series_id", normalizedSeriesIds);
    }
    return query
      .order("id", { ascending: true })
      .range(start, start + PUBLIC_HUMAN_RECORDING_PAGE_SIZE - 1);
  }

  for (let start = 0; ; start += PUBLIC_HUMAN_RECORDING_PAGE_SIZE) {
    let result = await fetchPage(start, PUBLIC_RECORDING_AGGREGATE_SELECT);
    if (result.error && isSchemaCompatibilityReadFailure(result.error)) {
      result = await fetchPage(start, "*");
    }
    if (result.error) {
      throw new Error(`recordings の取得に失敗: ${result.error.message}`);
    }

    const pageRows = (result.data ?? []) as unknown as RecordingAggregateRow[];
    data.push(...pageRows);
    if (pageRows.length < PUBLIC_HUMAN_RECORDING_PAGE_SIZE) {
      break;
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
  ["public-recording-aggregates-human-filtered-paged-v2"],
  { revalidate: 60 }
);

export async function getCachedPublicRecordingAggregates(
  seriesIds?: string[]
): Promise<PublicRecordingAggregate[]> {
  const normalizedSeriesIds = normalizeSeriesIds(seriesIds);
  return getCachedPublicRecordingAggregatesInternal(normalizedSeriesIds.join(","));
}
