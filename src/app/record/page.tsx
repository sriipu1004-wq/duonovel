import Link from "next/link";
import SearchNavButton from "@/components/search/SearchNavButton";
import RecordDashboardSearchControls from "@/components/recording/RecordDashboardSearchControls";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildRecordingEntryPath,
  buildWorkPath,
  normalizeRecordingPermissionMode,
  type RecordingPermissionMode,
} from "@/lib/recording/recordingEntry";
import {
  buildSeriesPopularityMap,
  createEmptyPopularityMetrics,
  fetchSeriesPopularityDataset,
  type SeriesPopularityMetrics,
} from "@/lib/popularity";
import {
  getEpisodeNumber,
  getSeriesGenres,
  getSeriesPublicationStatus,
  isEpisodePubliclyVisible,
  pickText,
  type EpisodeRow,
  type SeriesRow,
} from "@/features/write/writeShared";
import { RecordingLegalFooter } from "@/components/recording/RecordingLegalFooter";
import {
  getCachedPublicBaseWorkCards,
  type PublicBaseWorkCard,
} from "@/lib/publicWorks";
import {
  isHumanRecordingRow,
  isPublishedHumanRecording,
} from "@/lib/recording/humanRecordingState";
import {
  parsePublicSearchSourceLanguages,
  PUBLIC_SEARCH_SOURCE_LANGUAGES,
} from "@/lib/search/publicWorkLanguageFilter";
import type { SupportedLanguageTag } from "@/lib/translation/languageRegistry";
import { getCurrentR18ViewerPreference } from "@/lib/contentRatingServer";
import { isOfficialAccountEmail } from "@/lib/auth/officialAccount";
import { getUiLocale } from "@/i18n/server";
import { localizePath } from "@/i18n/navigation";
import type { UiLocale } from "@/i18n/config";
import {
  buildRecordingConsentPath,
  RECORDING_GLOBAL_CONSENT_KEY,
  RECORDING_GLOBAL_CONSENT_VERSION,
} from "@/lib/recording/recordingConsent";

type PageProps = {
  searchParams?: Promise<{
    q?: string;
    filter?: string;
    tag?: string;
    tags?: string;
    genres?: string;
    order?: string;
    sort?: string;
    mode?: string;
    start?: string;
    end?: string;
    showTags?: string;
    showGenres?: string;
    source_language?: string;
  }>;
};

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;
type RequestStatus = "pending" | "approved" | "rejected" | "cancelled";
type RecordFilter =
  | "all"
  | "submitted"
  | "ready"
  | "bookmarked";
type RecordOrderKey = "popular" | "updated" | "narration";

type RecordingRequestRow = Record<string, unknown> & {
  id: string;
  series_id?: string | null;
  status?: RequestStatus | null;
  request_message?: string | null;
  created_at?: string | null;
};

type BookmarkRow = Record<string, unknown> & {
  id: string;
  user_id?: string | null;
  series_id?: string | null;
  created_at?: string | null;
};

type RecordingRow = Record<string, unknown> & {
  id: string;
  series_id?: string | null;
  seriesId?: string | null;
  reader_id?: string | null;
  reader_user_id?: string | null;
  readerUserId?: string | null;
  reader_name?: string | null;
  episode_id?: string | null;
  audio_storage_path?: string | null;
  voice_model_id?: string | null;
  is_public?: boolean | null;
};

type HumanNarrationSummary = {
  recordingIds: string[];
  narratorNames: string[];
  episodeNumbers: number[];
  playCount: number;
};

type CatalogItem = {
  series: SeriesRow;
  title: string;
  summary: string;
  authorName: string;
  sourceLanguage: SupportedLanguageTag | null;
  humanNarrationCount: number;
  humanNarratorNames: string[];
  humanNarratedEpisodeNumbers: number[];
  humanNarrationPlayCount: number;
  permissionMode: RecordingPermissionMode;
  latestRequest: RecordingRequestRow | null;
  latestStatus: RequestStatus | null;
  isReady: boolean;
  isSubmitted: boolean;
  isBookmarked: boolean;
  tags: string[];
  genres: string[];
  latestTimestamp: number;
  popularity: SeriesPopularityMetrics;
  searchText: string;
};

type TagChip = {
  value: string;
  label: string;
  count: number;
};

type GenreChip = {
  key: string;
  label: string;
  count: number;
};

type RecordPageCopy = {
  resultTitle: string;
  backToSearch: string;
  filterLabel: string;
  queryLabel: string;
  tagsLabel: string;
  genresLabel: string;
  sourceLanguageLabel: string;
  orderLabel: string;
  unspecified: string;
  emptyQuery: string;
  orderPopular: string;
  orderUpdated: string;
  orderNarration: string;
  emptyResults: string;
  permissionOpen: string;
  permissionClosed: string;
  submitted: string;
  bookmarked: string;
  author: string;
  narrator: string;
  publishedNarrationCount: (count: number) => string;
  humanPlays: (count: number) => string;
  views: (count: number) => string;
  likes: (count: number) => string;
  bookmarks: (count: number) => string;
  workPage: string;
  listen: string;
  create: string;
  alsoNarrate: string;
  filterMeta: Record<RecordFilter, { label: string; description: string }>;
};

function getRecordPageCopy(locale: UiLocale): RecordPageCopy {
  if (locale === "en") {
    return {
      resultTitle: "Search results",
      backToSearch: "Back to search",
      filterLabel: "Filter",
      queryLabel: "Query",
      tagsLabel: "Tags",
      genresLabel: "Genres",
      sourceLanguageLabel: "Source language",
      orderLabel: "Order",
      unspecified: "Not specified",
      emptyQuery: "Not entered",
      orderPopular: "Popular",
      orderUpdated: "Updated",
      orderNarration: "Human narration plays",
      emptyResults: "No published Human narration matches these conditions.",
      permissionOpen: "Narration allowed",
      permissionClosed: "Narration unavailable",
      submitted: "Submitted",
      bookmarked: "Bookmarked",
      author: "Author",
      narrator: "Narrator",
      publishedNarrationCount: (count) => `Published narration ${count}`,
      humanPlays: (count) => `Human narration plays ${count}`,
      views: (count) => `Views ${count}`,
      likes: (count) => `Likes ${count}`,
      bookmarks: (count) => `Bookmarks ${count}`,
      workPage: "Work page",
      listen: "Listen",
      create: "Create narration",
      alsoNarrate: "Create my narration",
      filterMeta: {
        all: { label: "Published narration", description: "Show works with published Human narration." },
        submitted: { label: "Submitted", description: "Show works where you have submitted Human narration." },
        ready: { label: "Available", description: "Show public works that allow new Human narration." },
        bookmarked: { label: "Bookmarked", description: "Show bookmarked works with published Human narration." },
      },
    };
  }

  if (locale === "ko") {
    return {
      resultTitle: "검색 결과",
      backToSearch: "위 검색으로",
      filterLabel: "필터",
      queryLabel: "검색어",
      tagsLabel: "태그",
      genresLabel: "장르",
      sourceLanguageLabel: "원문 언어",
      orderLabel: "정렬",
      unspecified: "지정 안 함",
      emptyQuery: "입력 없음",
      orderPopular: "인기순",
      orderUpdated: "업데이트순",
      orderNarration: "Human narration 재생순",
      emptyResults: "조건에 맞는 공개 Human narration이 없습니다.",
      permissionOpen: "낭독 허용",
      permissionClosed: "낭독 불가",
      submitted: "제출 완료",
      bookmarked: "북마크",
      author: "작가",
      narrator: "낭독자",
      publishedNarrationCount: (count) => `공개 낭독 ${count}건`,
      humanPlays: (count) => `Human narration 재생 ${count}`,
      views: (count) => `조회 ${count}`,
      likes: (count) => `좋아요 ${count}`,
      bookmarks: (count) => `북마크 ${count}`,
      workPage: "작품 페이지",
      listen: "낭독 듣기",
      create: "낭독 제작",
      alsoNarrate: "나도 낭독하기",
      filterMeta: {
        all: { label: "공개 낭독", description: "공개된 Human narration이 있는 작품만 표시합니다." },
        submitted: { label: "제출 완료", description: "내가 Human narration을 제출한 작품만 표시합니다." },
        ready: { label: "낭독 가능", description: "새 Human narration을 제작할 수 있는 공개 작품만 표시합니다." },
        bookmarked: { label: "북마크", description: "북마크한 공개 Human narration 작품만 표시합니다." },
      },
    };
  }

  return {
    resultTitle: "検索結果",
    backToSearch: "上の検索へ",
    filterLabel: "フィルタ",
    queryLabel: "検索語",
    tagsLabel: "タグ",
    genresLabel: "ジャンル",
    sourceLanguageLabel: "原文言語",
    orderLabel: "並び順",
    unspecified: "未指定",
    emptyQuery: "未入力",
    orderPopular: "人気順",
    orderUpdated: "更新順",
    orderNarration: "Human narration視聴順",
    emptyResults: "条件に合う公開Human narrationはない。",
    permissionOpen: "朗読許可",
    permissionClosed: "朗読不可",
    submitted: "投稿済",
    bookmarked: "ブックマーク",
    author: "作者",
    narrator: "朗読者",
    publishedNarrationCount: (count) => `公開朗読 ${count}件`,
    humanPlays: (count) => `Human朗読視聴 ${count}`,
    views: (count) => `閲覧 ${count}`,
    likes: (count) => `いいね ${count}`,
    bookmarks: (count) => `ブックマーク ${count}`,
    workPage: "作品ページ",
    listen: "朗読を聞く",
    create: "朗読制作へ",
    alsoNarrate: "自分も朗読する",
    filterMeta: FILTER_META,
  };
}

const adminSupabase = createAdminClient();
const TOKYO_TIMEZONE = "Asia/Tokyo";

const FILTER_META: Record<
  RecordFilter,
  {
    label: string;
    description: string;
  }
> = {
  all: {
    label: "すべて",
    description: "公開中のHuman narrationがある作品だけを見る。",
  },
  submitted: {
    label: "投稿済",
    description: "自分がHuman narrationを投稿済みの作品だけを見る。",
  },
  ready: {
    label: "朗読可",
    description: "今すぐ朗読制作へ進める作品だけを見る。",
  },
  bookmarked: {
    label: "ブックマーク",
    description: "自分が保存した作品だけを見る。",
  },

};

function normalizeRequestStatus(value: unknown): RequestStatus | null {
  if (value === "pending") return "pending";
  if (value === "approved") return "approved";
  if (value === "rejected") return "rejected";
  if (value === "cancelled") return "cancelled";
  return null;
}

function normalizeRecordFilter(value: unknown): RecordFilter {
  if (value === "submitted") return "submitted";
  if (value === "ready") return "ready";
  if (value === "bookmarked") return "bookmarked";
  return "all";
}

function normalizeRecordOrder(value: unknown): RecordOrderKey {
  if (value === "updated") return "updated";
  if (value === "narration") return "narration";
  return "popular";
}

function getSeriesSummary(series: SeriesRow): string {
  return (
    pickText(
      series.summary,
      series.description,
      series.catch_copy,
      series.overview
    ) || "作品概要はまだ設定されていない。"
  );
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
  const candidates = [
    series["tags"],
    series["tag_list"],
    series["tagList"],
  ];

  for (const candidate of candidates) {
    const parsed = parseTagList(candidate);
    if (parsed.length > 0) {
      return parsed;
    }
  }

  return [];
}

function normalizeTagToken(value: string): string {
  return value.trim().replace(/^#+/, "").toLowerCase();
}

function normalizeGenreToken(value: string): string {
  return value.trim().toLowerCase();
}

function formatTagLabel(value: string): string {
  const trimmed = value.trim().replace(/^#+/, "");
  if (!trimmed) return "";
  return `#${trimmed}`;
}

function parseSelectedTagLabels(rawTags?: string, rawTag?: string): string[] {
  const values = [
    ...(rawTags ? rawTags.split(/[,\n、]/) : []),
    ...(rawTag ? [rawTag] : []),
  ];

  const unique = new Map<string, string>();

  for (const value of values) {
    const formatted = formatTagLabel(value);
    if (!formatted) continue;

    const normalized = normalizeTagToken(formatted);
    if (!normalized) continue;

    if (!unique.has(normalized)) {
      unique.set(normalized, formatted);
    }
  }

  return Array.from(unique.values());
}

function parseSelectedGenreLabels(rawGenres?: string): string[] {
  if (!rawGenres) {
    return [];
  }

  return rawGenres
    .split(/[,\n、]/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .slice(0, 3);
}

function normalizeSearchText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function getCreatedAtScore(value: string | null | undefined): number {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function formatInputDate(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return "";
  }

  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: TOKYO_TIMEZONE,
  }).formatToParts(new Date(value));

  const year = parts.find((part) => part.type === "year")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  const day = parts.find((part) => part.type === "day")?.value ?? "";

  if (!year || !month || !day) {
    return "";
  }

  return `${year}-${month}-${day}`;
}

function parseDateStart(value: string | undefined): number | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const parsed = new Date(`${value}T00:00:00+09:00`).getTime();
  return Number.isNaN(parsed) ? null : parsed;
}

function parseDateEnd(value: string | undefined): number | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const parsed = new Date(`${value}T23:59:59.999+09:00`).getTime();
  return Number.isNaN(parsed) ? null : parsed;
}

function getPermissionLabel(
  mode: RecordingPermissionMode,
  copy?: RecordPageCopy
): string {
  if (mode === "open") return copy?.permissionOpen ?? "朗読許可";
  return copy?.permissionClosed ?? "朗読不可";
}

function getPermissionClass(mode: RecordingPermissionMode): string {
  if (mode === "open") {
    return "border-sky-200 bg-sky-50 text-black";
  }

  return "border-black/10 bg-neutral-100 text-neutral-500";
}

function buildRecordSearchHref(args: {
  q?: string;
  filter?: RecordFilter;
  selectedTags?: string[];
  selectedGenres?: string[];
  sourceLanguages?: SupportedLanguageTag[];
  order?: RecordOrderKey;
  start?: string;
  end?: string;
  showTags?: boolean;
  showGenres?: boolean;
  anchor?: string;
}): string {
  const params = new URLSearchParams();

  if (args.q && args.q.trim()) {
    params.set("q", args.q.trim());
  }

  if (args.filter && args.filter !== "all") {
    params.set("filter", args.filter);
  }

  if (args.selectedTags && args.selectedTags.length > 0) {
    params.set("tags", args.selectedTags.join(","));
  }

  if (args.selectedGenres && args.selectedGenres.length > 0) {
    params.set("genres", args.selectedGenres.join(","));
  }

  if (args.sourceLanguages && args.sourceLanguages.length > 0) {
    params.set("source_language", args.sourceLanguages.join(","));
  }

  if (args.order) {
    params.set("order", args.order);
  }

  if (args.start) {
    params.set("start", args.start);
  }

  if (args.end) {
    params.set("end", args.end);
  }

  if (args.showTags) {
    params.set("showTags", "1");
  }

  if (args.showGenres) {
    params.set("showGenres", "1");
  }

  const queryString = params.toString();
  const base = queryString ? `/record?${queryString}` : "/record";

  return args.anchor ? `${base}#${args.anchor}` : base;
}

function buildRecordingStartHref(
  seriesId: string,
  hasRecordingGlobalConsent: boolean
): string {
  const entryPath = buildRecordingEntryPath(seriesId);

  if (hasRecordingGlobalConsent) {
    return entryPath;
  }

  return buildRecordingConsentPath(entryPath);
}

async function fetchMyRecordingGlobalConsent(
  supabase: SupabaseClient,
  userId: string | null
): Promise<boolean> {
  if (!userId) {
    return false;
  }

  const { data, error } = await supabase
    .from("user_recording_consents")
    .select("consent_version")
    .eq("user_id", userId)
    .eq("consent_key", RECORDING_GLOBAL_CONSENT_KEY)
    .maybeSingle();

  if (error) {
    return false;
  }

  return data?.consent_version === RECORDING_GLOBAL_CONSENT_VERSION;
}

async function fetchDiscoverableSeries(
  supabase: SupabaseClient
): Promise<SeriesRow[]> {
  const result = await supabase
    .from("series")
    .select("*")
    .order("created_at", { ascending: false });

  if (result.error) {
    return [];
  }

  return ((result.data ?? []) as SeriesRow[]).filter(
    (series) => getSeriesPublicationStatus(series) === "public"
  );
}

async function fetchPublishedHumanNarrationSummaries(
  seriesIds: string[]
): Promise<Map<string, HumanNarrationSummary>> {
  const normalizedSeriesIds = Array.from(
    new Set(seriesIds.map((value) => value.trim()).filter(Boolean))
  );
  if (normalizedSeriesIds.length === 0) return new Map();

  const recordingsResult = await adminSupabase
    .from("recordings")
    .select(
      "id, series_id, episode_id, reader_id, reader_user_id, reader_name, audio_storage_path, voice_model_id, is_public"
    )
    .in("series_id", normalizedSeriesIds)
    .is("voice_model_id", null)
    .eq("is_public", true);

  if (recordingsResult.error) return new Map();

  const candidateRecordings = ((recordingsResult.data ?? []) as RecordingRow[]).filter(
    isPublishedHumanRecording
  );
  if (candidateRecordings.length === 0) return new Map();

  const episodeIds = Array.from(
    new Set(
      candidateRecordings
        .map((recording) => pickText(recording.episode_id))
        .filter(Boolean)
    )
  );
  const episodesResult = episodeIds.length
    ? await adminSupabase.from("episodes").select("*").in("id", episodeIds)
    : { data: [] as EpisodeRow[], error: null };

  if (episodesResult.error) return new Map();

  const visibleEpisodeNumberById = new Map<string, number>();
  for (const episode of (episodesResult.data ?? []) as EpisodeRow[]) {
    if (!isEpisodePubliclyVisible(episode, new Date())) continue;
    const episodeNumber = getEpisodeNumber(episode);
    if (episodeNumber > 0) {
      visibleEpisodeNumberById.set(episode.id, episodeNumber);
    }
  }

  const visibleRecordings = candidateRecordings.filter((recording) =>
    visibleEpisodeNumberById.has(pickText(recording.episode_id))
  );
  if (visibleRecordings.length === 0) return new Map();

  const recordingIds = visibleRecordings.map((recording) => recording.id);
  const playsResult = await adminSupabase
    .from("recording_play_events")
    .select("recording_id")
    .in("recording_id", recordingIds);
  const playCountByRecordingId = new Map<string, number>();
  if (!playsResult.error) {
    for (const row of (playsResult.data ?? []) as Array<Record<string, unknown>>) {
      const recordingId = pickText(row.recording_id);
      if (!recordingId) continue;
      playCountByRecordingId.set(
        recordingId,
        (playCountByRecordingId.get(recordingId) ?? 0) + 1
      );
    }
  }

  const summaries = new Map<string, HumanNarrationSummary>();
  for (const recording of visibleRecordings) {
    const seriesId = pickText(recording.series_id, recording.seriesId);
    const episodeId = pickText(recording.episode_id);
    const narratorName = pickText(recording.reader_name);
    const episodeNumber = visibleEpisodeNumberById.get(episodeId);
    if (!seriesId || !narratorName || !episodeNumber) continue;

    const current = summaries.get(seriesId) ?? {
      recordingIds: [],
      narratorNames: [],
      episodeNumbers: [],
      playCount: 0,
    };
    current.recordingIds.push(recording.id);
    if (!current.narratorNames.includes(narratorName)) {
      current.narratorNames.push(narratorName);
    }
    if (!current.episodeNumbers.includes(episodeNumber)) {
      current.episodeNumbers.push(episodeNumber);
    }
    current.playCount += playCountByRecordingId.get(recording.id) ?? 0;
    summaries.set(seriesId, current);
  }

  for (const summary of summaries.values()) {
    summary.episodeNumbers.sort((left, right) => left - right);
  }

  return summaries;
}

async function fetchMyRecordingRequests(
  supabase: SupabaseClient,
  userId: string | null
): Promise<RecordingRequestRow[]> {
  if (!userId) {
    return [];
  }

  const { data, error } = await supabase
    .from("series_recording_requests")
    .select("*")
    .eq("requester_user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    return [];
  }

  return (data ?? []) as RecordingRequestRow[];
}

async function fetchMyBookmarks(
  supabase: SupabaseClient,
  userId: string | null
): Promise<BookmarkRow[]> {
  if (!userId) {
    return [];
  }

  const { data, error } = await supabase
    .from("user_series_bookmarks")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    return [];
  }

  return (data ?? []) as BookmarkRow[];
}

async function fetchMySubmittedSeriesIds(
  userId: string | null
): Promise<Set<string>> {
  if (!userId) {
    return new Set();
  }

  const collected = new Set<string>();

  const selection =
    "id, series_id, episode_id, reader_id, reader_user_id, reader_name, audio_storage_path, voice_model_id, is_public";
  const tries = [
    () =>
      adminSupabase
        .from("recordings")
        .select(selection)
        .eq("reader_id", userId),
    () =>
      adminSupabase
        .from("recordings")
        .select(selection)
        .eq("reader_user_id", userId),
  ];

  for (const run of tries) {
    const { data, error } = await run();

    if (error) {
      continue;
    }

    for (const row of (data ?? []) as RecordingRow[]) {
      if (!isHumanRecordingRow(row)) continue;
      const seriesId = pickText(row.series_id, row.seriesId);
      if (seriesId) {
        collected.add(seriesId);
      }
    }
  }

  return collected;
}

function buildLatestRequestMap(
  requests: RecordingRequestRow[]
): Map<string, RecordingRequestRow> {
  const latestMap = new Map<string, RecordingRequestRow>();

  for (const request of requests) {
    const seriesId = pickText(request.series_id);
    if (!seriesId) continue;

    const existing = latestMap.get(seriesId);
    if (!existing) {
      latestMap.set(seriesId, request);
      continue;
    }

    if (
      getCreatedAtScore(request.created_at) >
      getCreatedAtScore(existing.created_at)
    ) {
      latestMap.set(seriesId, request);
    }
  }

  return latestMap;
}

function buildCatalogItem(args: {
  series: SeriesRow;
  baseWork: PublicBaseWorkCard;
  humanNarration: HumanNarrationSummary | null;
  latestRequestMap: Map<string, RecordingRequestRow>;
  bookmarkedSeriesIds: Set<string>;
  submittedSeriesIds: Set<string>;
  popularity: SeriesPopularityMetrics;
}): CatalogItem {
  const {
    series,
    baseWork,
    humanNarration,
    latestRequestMap,
    bookmarkedSeriesIds,
    submittedSeriesIds,
    popularity,
  } = args;

  const title = baseWork.title || pickText(series.title) || "無題";
  const summary = baseWork.summary || getSeriesSummary(series);
  const authorName = baseWork.authorName || "作者名未設定";
  const sourceLanguage = baseWork.sourceLanguage;
  const humanNarrationCount = humanNarration?.recordingIds.length ?? 0;
  const humanNarratorNames = humanNarration?.narratorNames ?? [];
  const humanNarratedEpisodeNumbers = humanNarration?.episodeNumbers ?? [];
  const humanNarrationPlayCount = humanNarration?.playCount ?? 0;
  const permissionMode = normalizeRecordingPermissionMode(
    series.recording_permission_mode
  );
  const latestRequest = latestRequestMap.get(series.id) ?? null;
  const latestStatus = normalizeRequestStatus(latestRequest?.status);
  const isReady = permissionMode === "open";
  const isSubmitted = submittedSeriesIds.has(series.id);
  const isBookmarked = bookmarkedSeriesIds.has(series.id);
  const tags = baseWork.tags.length > 0 ? baseWork.tags : getSeriesTags(series);
  const genres =
    baseWork.genres.length > 0 ? baseWork.genres : getSeriesGenres(series);
  const latestTimestamp =
    baseWork.latestPostedAtValue ||
    getCreatedAtScore(
      pickText(series.updated_at, series.created_at, latestRequest?.created_at)
    );

  return {
    series,
    title,
    summary,
    authorName,
    sourceLanguage,
    humanNarrationCount,
    humanNarratorNames,
    humanNarratedEpisodeNumbers,
    humanNarrationPlayCount,
    permissionMode,
    latestRequest,
    latestStatus,
    isReady,
    isSubmitted,
    isBookmarked,
    tags,
    genres,
    latestTimestamp,
    popularity,
    searchText: normalizeSearchText(
      [
        title,
        authorName,
        summary,
        humanNarratorNames.join(" "),
        getPermissionLabel(permissionMode),
        tags.join(" "),
        genres.join(" "),
      ].join(" ")
    ),
  };
}

function matchesFilter(item: CatalogItem, filter: RecordFilter): boolean {
  if (filter === "all") return item.humanNarrationCount > 0;
  if (filter === "submitted") return item.isSubmitted;
  if (filter === "ready") return item.isReady;
  if (filter === "bookmarked") {
    return item.isBookmarked && item.humanNarrationCount > 0;
  }
  return item.humanNarrationCount > 0;
}

function matchesSourceLanguages(
  item: CatalogItem,
  sourceLanguages: readonly SupportedLanguageTag[]
): boolean {
  if (sourceLanguages.length === 0) return true;
  return (
    item.sourceLanguage !== null && sourceLanguages.includes(item.sourceLanguage)
  );
}

function buildSourceLanguageCounts(
  items: CatalogItem[]
): Partial<Record<SupportedLanguageTag, number>> {
  const counts: Partial<Record<SupportedLanguageTag, number>> = {};
  for (const language of PUBLIC_SEARCH_SOURCE_LANGUAGES) {
    counts[language] = 0;
  }
  for (const item of items) {
    if (!item.sourceLanguage) continue;
    counts[item.sourceLanguage] = (counts[item.sourceLanguage] ?? 0) + 1;
  }
  return counts;
}

function matchesSearch(args: {
  item: CatalogItem;
  query: string;
  selectedTagTokens: string[];
  selectedGenreTokens: string[];
  sourceLanguages: readonly SupportedLanguageTag[];
  startAt: number | null;
  endAt: number | null;
}): boolean {
  const {
    item,
    query,
    selectedTagTokens,
    selectedGenreTokens,
    sourceLanguages,
    startAt,
    endAt,
  } = args;

  const queryOk = !query || item.searchText.includes(query);

  const tagOk =
    selectedTagTokens.length === 0 ||
    selectedTagTokens.every((selectedToken) =>
      item.tags.some((tag) => normalizeTagToken(tag) === selectedToken)
    );

  const genreOk =
    selectedGenreTokens.length === 0 ||
    selectedGenreTokens.every((selectedToken) =>
      item.genres.some((genre) => normalizeGenreToken(genre) === selectedToken)
    );

  const languageOk = matchesSourceLanguages(item, sourceLanguages);

  const dateOk =
    startAt === null ||
    endAt === null ||
    (item.latestTimestamp >= Math.min(startAt, endAt) &&
      item.latestTimestamp <= Math.max(startAt, endAt));

  return queryOk && tagOk && genreOk && languageOk && dateOk;
}

function sortCatalogItems(
  items: CatalogItem[],
  order: RecordOrderKey
): CatalogItem[] {
  return [...items].sort((left, right) => {
    if (order === "updated") {
      if (right.latestTimestamp !== left.latestTimestamp) {
        return right.latestTimestamp - left.latestTimestamp;
      }
    } else if (order === "narration") {
      if (
        right.humanNarrationPlayCount !== left.humanNarrationPlayCount
      ) {
        return right.humanNarrationPlayCount - left.humanNarrationPlayCount;
      }
    } else {
      if (
        right.popularity.popularityScore !== left.popularity.popularityScore
      ) {
        return (
          right.popularity.popularityScore - left.popularity.popularityScore
        );
      }
    }

    if (right.popularity.viewCount !== left.popularity.viewCount) {
      return right.popularity.viewCount - left.popularity.viewCount;
    }

    return left.title.localeCompare(right.title, "ja");
  });
}

function buildAvailableTags(items: CatalogItem[]): TagChip[] {
  const counter = new Map<string, TagChip>();

  for (const item of items) {
    const seen = new Set<string>();

    for (const tag of item.tags) {
      const normalized = normalizeTagToken(tag);
      if (!normalized || seen.has(normalized)) {
        continue;
      }

      seen.add(normalized);

      const current = counter.get(normalized);
      if (current) {
        current.count += 1;
        continue;
      }

      counter.set(normalized, {
        value: normalized,
        label: formatTagLabel(tag),
        count: 1,
      });
    }
  }

  return Array.from(counter.values()).sort((left, right) => {
    if (right.count !== left.count) {
      return right.count - left.count;
    }

    return left.value.localeCompare(right.value, "ja");
  });
}

function buildAvailableGenres(items: CatalogItem[]): GenreChip[] {
  const counter = new Map<string, GenreChip>();

  for (const item of items) {
    const seen = new Set<string>();

    for (const genre of item.genres) {
      const trimmed = genre.trim();
      const normalized = normalizeGenreToken(trimmed);

      if (!normalized || seen.has(normalized)) {
        continue;
      }

      seen.add(normalized);

      const current = counter.get(normalized);
      if (current) {
        current.count += 1;
        continue;
      }

      counter.set(normalized, {
        key: normalized,
        label: trimmed,
        count: 1,
      });
    }
  }

  return Array.from(counter.values()).sort((left, right) => {
    if (right.count !== left.count) {
      return right.count - left.count;
    }

    return left.label.localeCompare(right.label, "ja");
  });
}

function buildHumanNarrationListenPath(item: CatalogItem): string | null {
  const episodeNumber = item.humanNarratedEpisodeNumbers[0];
  const narratorName = item.humanNarratorNames[0];
  if (!episodeNumber || !narratorName) return null;
  const params = new URLSearchParams({ readerName: narratorName });
  return `/read/${item.series.id}/${episodeNumber}?${params.toString()}`;
}

function getPrimaryAction(
  item: CatalogItem,
  hasRecordingGlobalConsent: boolean,
  canCreateHumanNarration: boolean,
  copy: RecordPageCopy,
  locale: UiLocale
): {
  href: string;
  label: string;
  className: string;
} {
  const listenHref = buildHumanNarrationListenPath(item);
  if (listenHref) {
    return {
      href: localizePath(listenHref, locale),
      label: copy.listen,
      className:
        "rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-medium text-black transition hover:bg-sky-100",
    };
  }

  if (item.isReady && canCreateHumanNarration) {
    return {
      href: localizePath(
        buildRecordingStartHref(item.series.id, hasRecordingGlobalConsent),
        locale
      ),
      label: copy.create,
      className:
        "rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-medium text-black transition hover:bg-sky-100",
    };
  }

  return {
    href: localizePath(buildWorkPath(item.series.id), locale),
    label: copy.workPage,
    className:
      "rounded-full border border-black/10 bg-white px-4 py-2 text-sm text-neutral-700 transition hover:bg-neutral-50",
  };
}

function SectionFrame({
  id,
  label,
  title,
  description,
  action,
  children,
}: {
  id?: string;
  label: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className="rounded-[28px] border border-black/10 bg-white p-5 shadow-sm scroll-mt-24 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] tracking-[0.22em] text-neutral-500">{label}</p>
          <h2 className="mt-2 text-xl font-bold text-black">{title}</h2>
          {description ? (
            <p className="mt-3 text-sm leading-7 text-neutral-600">
              {description}
            </p>
          ) : null}
        </div>

        {action ? <div>{action}</div> : null}
      </div>

      <div className="mt-5">{children}</div>
    </section>
  );
}

function RecordCatalogCard({
  item,
  hasRecordingGlobalConsent,
  canCreateHumanNarration,
  copy,
  locale,
}: {
  item: CatalogItem;
  hasRecordingGlobalConsent: boolean;
  canCreateHumanNarration: boolean;
  copy: RecordPageCopy;
  locale: UiLocale;
}) {
  const primaryAction = getPrimaryAction(
    item,
    hasRecordingGlobalConsent,
    canCreateHumanNarration,
    copy,
    locale
  );

  return (
    <article className="rounded-[24px] border border-black/10 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold text-black">{item.title}</h3>

            <span
              className={[
                "rounded-full border px-3 py-1 text-xs",
                getPermissionClass(item.permissionMode),
              ].join(" ")}
            >
              {getPermissionLabel(item.permissionMode, copy)}
            </span>

            {item.isSubmitted ? (
              <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs text-black">
                {copy.submitted}
              </span>
            ) : null}

            {item.isBookmarked ? (
              <span className="rounded-full border border-black/10 bg-neutral-100 px-3 py-1 text-xs text-neutral-700">
                {copy.bookmarked}
              </span>
            ) : null}
          </div>

          <p className="mt-2 text-sm text-neutral-500">{copy.author}: {item.authorName}</p>

          {item.humanNarrationCount > 0 ? (
            <div className="mt-2 text-sm leading-7 text-neutral-700">
              <span className="font-medium text-black">Human narration</span>
              {" · "}
              {copy.narrator}: {item.humanNarratorNames.join(" / ")}
              {" · "}
              {copy.publishedNarrationCount(item.humanNarrationCount)}
            </div>
          ) : null}

          <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-neutral-700">
            {item.summary}
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            {item.genres.slice(0, 3).map((genre) => (
              <span
                key={genre}
                className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs text-violet-700"
              >
                {genre}
              </span>
            ))}

            {item.tags.slice(0, 4).map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-black/10 bg-neutral-50 px-3 py-1 text-xs text-neutral-600"
              >
                {tag}
              </span>
            ))}
          </div>

          <div className="mt-4 text-sm leading-7 text-neutral-500">
            {copy.humanPlays(item.humanNarrationPlayCount)} / {copy.views(item.popularity.viewCount)} /{" "}
            {copy.likes(item.popularity.likeCount)} / {copy.bookmarks(item.popularity.bookmarkCount)}
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href={localizePath(buildWorkPath(item.series.id), locale)}
            className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm text-neutral-700 transition hover:bg-neutral-50"
          >
            {copy.workPage}
          </Link>

          <Link href={primaryAction.href} className={primaryAction.className}>
            {primaryAction.label}
          </Link>

          {item.humanNarrationCount > 0 &&
          item.isReady &&
          canCreateHumanNarration ? (
            <Link
              href={localizePath(
                buildRecordingStartHref(
                  item.series.id,
                  hasRecordingGlobalConsent
                ),
                locale
              )}
              className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm text-neutral-700 transition hover:bg-neutral-50"
            >
              {copy.alsoNarrate}
            </Link>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export default async function RecordPortalPage({ searchParams }: PageProps) {
  const locale = await getUiLocale();
  const copy = getRecordPageCopy(locale);
  const resolvedSearchParams = searchParams ? await searchParams : undefined;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const query = pickText(resolvedSearchParams?.q);
  const activeFilter = normalizeRecordFilter(resolvedSearchParams?.filter);
  const order = normalizeRecordOrder(
    pickText(
      resolvedSearchParams?.order,
      resolvedSearchParams?.sort,
      resolvedSearchParams?.mode
    )
  );

  const selectedTagLabels = parseSelectedTagLabels(
    pickText(resolvedSearchParams?.tags),
    pickText(resolvedSearchParams?.tag)
  );
  const selectedGenreLabels = parseSelectedGenreLabels(
    pickText(resolvedSearchParams?.genres)
  );

  const selectedTagTokens = selectedTagLabels.map(normalizeTagToken);
  const selectedGenreTokens = selectedGenreLabels.map(normalizeGenreToken);
  const selectedSourceLanguages = parsePublicSearchSourceLanguages(
    resolvedSearchParams?.source_language
  );
  const normalizedQuery = normalizeSearchText(query);

  const showAllTags = pickText(resolvedSearchParams?.showTags) === "1";
  const showAllGenres = pickText(resolvedSearchParams?.showGenres) === "1";

  const [
    allPublicBaseWorkCards,
    r18Preference,
    rawDiscoverableSeries,
    myRequests,
    myBookmarks,
    mySubmittedSeriesIds,
    hasRecordingGlobalConsent,
  ] = await Promise.all([
    getCachedPublicBaseWorkCards({
      visibility: "all",
      ignoreContentLanguageFilter: true,
      prioritizeForUiLocale: false,
    }),
    getCurrentR18ViewerPreference(),
    fetchDiscoverableSeries(supabase),
    fetchMyRecordingRequests(supabase, user?.id ?? null),
    fetchMyBookmarks(supabase, user?.id ?? null),
    fetchMySubmittedSeriesIds(user?.id ?? null),
    fetchMyRecordingGlobalConsent(supabase, user?.id ?? null),
  ]);
  const visibleBaseWorkCards = r18Preference.showR18Content
    ? allPublicBaseWorkCards
    : allPublicBaseWorkCards.filter((work) => work.contentRating !== "r18");
  const visibleBaseWorkBySeriesId = new Map(
    visibleBaseWorkCards.map((work) => [work.seriesId, work] as const)
  );

  const discoverableSeries = rawDiscoverableSeries.filter((series) =>
    visibleBaseWorkBySeriesId.has(series.id)
  );
  const discoverableSeriesIds = discoverableSeries.map((series) => series.id);
  const [humanNarrationSummaries, popularityDataset] = await Promise.all([
    fetchPublishedHumanNarrationSummaries(discoverableSeriesIds),
    fetchSeriesPopularityDataset(discoverableSeriesIds),
  ]);
  const canCreateHumanNarration = !isOfficialAccountEmail(user?.email);

  const latestRequestMap = buildLatestRequestMap(myRequests);
  const bookmarkedSeriesIds = new Set(
    myBookmarks
      .map((row) => pickText(row.series_id))
      .filter((value) => value.length > 0)
  );

  const popularityMap = buildSeriesPopularityMap(popularityDataset);

  const catalogItems = sortCatalogItems(
    discoverableSeries.flatMap((series) => {
      const baseWork = visibleBaseWorkBySeriesId.get(series.id);
      if (!baseWork) return [];
      return [
        buildCatalogItem({
        series,
        baseWork,
        humanNarration: humanNarrationSummaries.get(series.id) ?? null,
        latestRequestMap,
        bookmarkedSeriesIds,
        submittedSeriesIds: mySubmittedSeriesIds,
        popularity:
          popularityMap.get(series.id) ?? createEmptyPopularityMetrics(series.id),
        }),
      ];
    }),
    order
  );

  const oldestTimestamp =
    catalogItems.reduce((min, item) => {
      const candidate = item.latestTimestamp;
      if (candidate <= 0) return min;
      return min === 0 ? candidate : Math.min(min, candidate);
    }, 0) || Date.now();

  const defaultStartInput = formatInputDate(oldestTimestamp);
  const defaultEndInput = formatInputDate(Date.now());

  const selectedStartInput =
    pickText(resolvedSearchParams?.start) || defaultStartInput;
  const selectedEndInput =
    pickText(resolvedSearchParams?.end) || defaultEndInput;

  const startAt = parseDateStart(selectedStartInput);
  const endAt = parseDateEnd(selectedEndInput);

  const tagFacetItems = catalogItems.filter(
    (item) =>
      matchesFilter(item, activeFilter) &&
      matchesSearch({
        item,
        query: normalizedQuery,
        selectedTagTokens: [],
        selectedGenreTokens,
        sourceLanguages: selectedSourceLanguages,
        startAt,
        endAt,
      })
  );
  const genreFacetItems = catalogItems.filter(
    (item) =>
      matchesFilter(item, activeFilter) &&
      matchesSearch({
        item,
        query: normalizedQuery,
        selectedTagTokens,
        selectedGenreTokens: [],
        sourceLanguages: selectedSourceLanguages,
        startAt,
        endAt,
      })
  );
  const sourceLanguageFacetItems = catalogItems.filter(
    (item) =>
      matchesFilter(item, activeFilter) &&
      matchesSearch({
        item,
        query: normalizedQuery,
        selectedTagTokens,
        selectedGenreTokens,
        sourceLanguages: [],
        startAt,
        endAt,
      })
  );
  const availableTags = buildAvailableTags(tagFacetItems);
  const availableGenres = buildAvailableGenres(genreFacetItems);
  const sourceLanguageCounts = buildSourceLanguageCounts(
    sourceLanguageFacetItems
  );

  const filteredCatalogItems = sortCatalogItems(
    catalogItems.filter(
      (item) =>
        matchesFilter(item, activeFilter) &&
        matchesSearch({
          item,
          query: normalizedQuery,
          selectedTagTokens,
          selectedGenreTokens,
          sourceLanguages: selectedSourceLanguages,
          startAt,
          endAt,
        })
    ),
    order
  );



  return (
    <main className="min-h-screen bg-[#f4f4f4] text-black">
      <div className="mx-auto w-full max-w-7xl px-4 pb-20 pt-6 sm:px-6 lg:px-8">
        <div className="mb-4 text-sm text-neutral-500">
          <Link href="/" className="hover:text-black">
            TOP
          </Link>
          <span className="mx-2">/</span>
          <span className="text-neutral-700">朗読ページ</span>
        </div>

        <section className="rounded-[28px] border border-black/10 bg-white p-5 shadow-sm sm:p-6 lg:p-8">
          <p className="text-[11px] tracking-[0.24em] text-neutral-500">
            RECORD MANAGEMENT
          </p>
          <h1 className="mt-3 text-2xl font-bold leading-tight text-black sm:text-3xl">
            朗読管理トップ
          </h1>
          <p className="mt-3 max-w-4xl text-sm leading-8 text-neutral-600 sm:text-[15px]">
            朗読作品の検索、投稿済み朗読、ブックマーク作品、朗読状況をここでまとめて管理する。
          </p>

          <div className="mt-5 flex flex-wrap gap-2">
            <a
              href="#record-search"
              className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm text-neutral-700 transition hover:bg-neutral-50"
            >
              検索
            </a>
            <a
              href="#record-search-results"
              className="rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-sm text-black transition hover:bg-sky-100"
            >
              検索結果
            </a>
          </div>
        </section>

        <div className="mt-6">
          <RecordDashboardSearchControls
            query={query}
            selectedTagLabels={selectedTagLabels}
            selectedGenreLabels={selectedGenreLabels}
            filter={activeFilter}
            order={order}
            selectedStartInput={selectedStartInput}
            selectedEndInput={selectedEndInput}
            defaultStartInput={defaultStartInput}
            defaultEndInput={defaultEndInput}
            visibleTagChips={showAllTags ? availableTags : availableTags.slice(0, 10)}
            hasHiddenTags={availableTags.length > 10}
            visibleGenreChips={
              showAllGenres ? availableGenres : availableGenres.slice(0, 8)
            }
            hasHiddenGenres={availableGenres.length > 8}
            showAllTags={showAllTags}
            showAllGenres={showAllGenres}
            sourceLanguages={selectedSourceLanguages}
            sourceLanguageCounts={sourceLanguageCounts}
          />
        </div>

        <div className="mt-6 grid gap-6">

          <SectionFrame
            id="record-search-results"
            label="SEARCH RESULTS"
            title={copy.resultTitle}
            description={copy.filterMeta[activeFilter].description}
            action={
              <SearchNavButton
                href={buildRecordSearchHref({
                  q: query,
                  filter: activeFilter,
                  selectedTags: selectedTagLabels,
                  selectedGenres: selectedGenreLabels,
                  sourceLanguages: selectedSourceLanguages,
                  order,
                  start: selectedStartInput,
                  end: selectedEndInput,
                  showTags: showAllTags,
                  showGenres: showAllGenres,
                })}
                scrollTargetId="record-search"
                className="rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-sm text-black transition hover:bg-sky-100"
              >
                {copy.backToSearch}
              </SearchNavButton>
            }
          >
            <div className="mb-4 rounded-2xl border border-black/10 bg-neutral-50 px-4 py-4 text-sm leading-7 text-neutral-600">
              {copy.filterLabel}: {copy.filterMeta[activeFilter].label}
              <br />
              {copy.queryLabel}: {query ? `「${query}」` : copy.emptyQuery}
              <br />
              {copy.tagsLabel}: {selectedTagLabels.length > 0 ? selectedTagLabels.join(" / ") : copy.unspecified}
              <br />
              {copy.genresLabel}:{" "}
              {selectedGenreLabels.length > 0
                ? selectedGenreLabels.join(" / ")
                : copy.unspecified}
              <br />
              {copy.sourceLanguageLabel}:{" "}
              {selectedSourceLanguages.length > 0
                ? selectedSourceLanguages.join(" / ")
                : copy.unspecified}
              <br />
              {copy.orderLabel}:{" "}
              {order === "updated"
                ? copy.orderUpdated
                : order === "narration"
                  ? copy.orderNarration
                  : copy.orderPopular}
            </div>

            {filteredCatalogItems.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-black/15 bg-neutral-50 px-4 py-4 text-sm leading-7 text-neutral-600">
                {copy.emptyResults}
              </div>
            ) : (
              <div className="grid gap-4">
                {filteredCatalogItems.map((item) => (
                  <RecordCatalogCard
                    key={item.series.id}
                    item={item}
                    hasRecordingGlobalConsent={hasRecordingGlobalConsent}
                    canCreateHumanNarration={canCreateHumanNarration}
                    copy={copy}
                    locale={locale}
                  />
                ))}
              </div>
            )}
          </SectionFrame>
        </div>

        <div className="mt-6">
          <RecordingLegalFooter />
        </div>
      </div>
    </main>
  );
}
