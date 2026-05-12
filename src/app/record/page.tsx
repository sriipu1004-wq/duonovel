import Link from "next/link";
import SearchNavButton from "@/components/search/SearchNavButton";
import RecordDashboardSearchControls from "@/components/recording/RecordDashboardSearchControls";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildRecordingEntryPath,
  buildRecordingRequestPath,
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
  getSeriesGenres,
  getSeriesPublicationStatus,
  pickText,
  type SeriesRow,
} from "@/features/write/writeShared";
import { RecordingLegalFooter } from "@/components/recording/RecordingLegalFooter";
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
};

type CatalogItem = {
  series: SeriesRow;
  title: string;
  summary: string;
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

type RequestListItem = {
  seriesId: string;
  request: RecordingRequestRow;
  seriesTitle: string;
  permissionMode: RecordingPermissionMode;
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
    description: "公開中の朗読関連作品をまとめて見る。",
  },
  submitted: {
    label: "投稿済",
    description: "自分が朗読投稿済みの作品だけを見る。",
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

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "未記録";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ja-JP");
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

function getPermissionLabel(mode: RecordingPermissionMode): string {
  if (mode === "open") return "朗読許可";
  return "朗読不可";
}

function getPermissionClass(mode: RecordingPermissionMode): string {
  if (mode === "open") {
    return "border-sky-200 bg-sky-50 text-black";
  }

  return "border-black/10 bg-neutral-100 text-neutral-500";
}

function getRequestStatusLabel(status: RequestStatus | null): string {
  if (status === "pending") return "未使用";
  if (status === "approved") return "朗読許可";
  if (status === "rejected") return "却下";
  if (status === "cancelled") return "取消済み";
  return "未申請";
}

function getRequestStatusClass(status: RequestStatus | null): string {
  if (status === "pending") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  if (status === "approved") {
    return "border-sky-200 bg-sky-50 text-black";
  }

  if (status === "rejected") {
    return "border-red-200 bg-red-50 text-red-700";
  }

  if (status === "cancelled") {
    return "border-black/10 bg-neutral-100 text-neutral-500";
  }

  return "border-black/10 bg-neutral-100 text-neutral-500";
}

function buildRecordSearchHref(args: {
  q?: string;
  filter?: RecordFilter;
  selectedTags?: string[];
  selectedGenres?: string[];
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
  const firstTry = await supabase
    .from("series")
    .select("*")
    .in("recording_permission_mode", ["open"])
    .order("created_at", { ascending: false });

  if (!firstTry.error) {
    return ((firstTry.data ?? []) as SeriesRow[]).filter(
      (series) => getSeriesPublicationStatus(series) === "public"
    );
  }

  const secondTry = await supabase
    .from("series")
    .select("*")
    .order("created_at", { ascending: false });

  if (secondTry.error) {
    return [];
  }

  return ((secondTry.data ?? []) as SeriesRow[]).filter((series) => {
    if (getSeriesPublicationStatus(series) !== "public") {
      return false;
    }

    const mode = normalizeRecordingPermissionMode(series.recording_permission_mode);
    return mode === "open";
  });
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

  const tries = [
    () =>
      adminSupabase
        .from("recordings")
        .select("series_id")
        .eq("reader_id", userId),
    () =>
      adminSupabase
        .from("recordings")
        .select("series_id")
        .eq("reader_user_id", userId),
    () =>
      adminSupabase
        .from("recordings")
        .select("seriesId")
        .eq("readerUserId", userId),
  ];

  for (const run of tries) {
    const { data, error } = await run();

    if (error) {
      continue;
    }

    for (const row of (data ?? []) as RecordingRow[]) {
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
  latestRequestMap: Map<string, RecordingRequestRow>;
  bookmarkedSeriesIds: Set<string>;
  submittedSeriesIds: Set<string>;
  popularity: SeriesPopularityMetrics;
}): CatalogItem {
  const { series, latestRequestMap, bookmarkedSeriesIds, submittedSeriesIds, popularity } =
    args;

  const title = pickText(series.title) || "無題";
  const summary = getSeriesSummary(series);
  const permissionMode = normalizeRecordingPermissionMode(
    series.recording_permission_mode
  );
  const latestRequest = latestRequestMap.get(series.id) ?? null;
  const latestStatus = normalizeRequestStatus(latestRequest?.status);
  const isReady = permissionMode === "open";
  const isSubmitted = submittedSeriesIds.has(series.id);
  const isBookmarked = bookmarkedSeriesIds.has(series.id);
  const tags = getSeriesTags(series);
  const genres = getSeriesGenres(series);
  const latestTimestamp = getCreatedAtScore(
    pickText(
      series.updated_at,
      series.created_at,
      latestRequest?.created_at
    )
  );

  return {
    series,
    title,
    summary,
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
        summary,
        getPermissionLabel(permissionMode),
        tags.join(" "),
        genres.join(" "),
      ].join(" ")
    ),
  };
}

function matchesFilter(item: CatalogItem, filter: RecordFilter): boolean {
  if (filter === "all") return true;
  if (filter === "submitted") return item.isSubmitted;
  if (filter === "ready") return item.isReady;
  if (filter === "bookmarked") return item.isBookmarked;
  return true;
}

function matchesSearch(args: {
  item: CatalogItem;
  query: string;
  selectedTagTokens: string[];
  selectedGenreTokens: string[];
  startAt: number | null;
  endAt: number | null;
}): boolean {
  const { item, query, selectedTagTokens, selectedGenreTokens, startAt, endAt } = args;

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

  const dateOk =
    startAt === null ||
    endAt === null ||
    (item.latestTimestamp >= Math.min(startAt, endAt) &&
      item.latestTimestamp <= Math.max(startAt, endAt));

  return queryOk && tagOk && genreOk && dateOk;
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
        right.popularity.narrationPlayCount !== left.popularity.narrationPlayCount
      ) {
        return (
          right.popularity.narrationPlayCount -
          left.popularity.narrationPlayCount
        );
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

function getPrimaryAction(
  item: CatalogItem,
  hasRecordingGlobalConsent: boolean
): {
  href: string;
  label: string;
  className: string;
} {
  if (item.isReady) {
    return {
      href: buildRecordingStartHref(
        item.series.id,
        hasRecordingGlobalConsent
      ),
      label: "朗読制作へ",
      className:
        "rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-medium text-black transition hover:bg-sky-100",
    };
  }

  return {
    href: buildWorkPath(item.series.id),
    label: "作品ページへ",
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
}: {
  item: CatalogItem;
  hasRecordingGlobalConsent: boolean;
}) {
  const primaryAction = getPrimaryAction(item, hasRecordingGlobalConsent);

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
              {getPermissionLabel(item.permissionMode)}
            </span>

            {item.isSubmitted ? (
              <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs text-black">
                投稿済
              </span>
            ) : null}

            {item.isBookmarked ? (
              <span className="rounded-full border border-black/10 bg-neutral-100 px-3 py-1 text-xs text-neutral-700">
                ブックマーク
              </span>
            ) : null}
          </div>

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
            朗読視聴 {item.popularity.narrationPlayCount} / 閲覧 {item.popularity.viewCount} / いいね{" "}
            {item.popularity.likeCount} / ブックマーク {item.popularity.bookmarkCount}
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href={buildWorkPath(item.series.id)}
            className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm text-neutral-700 transition hover:bg-neutral-50"
          >
            作品ページ
          </Link>

          <Link href={primaryAction.href} className={primaryAction.className}>
            {primaryAction.label}
          </Link>
        </div>
      </div>
    </article>
  );
}

function RequestStatusCard({
  item,
  hasRecordingGlobalConsent,
}: {
  item: RequestListItem;
  hasRecordingGlobalConsent: boolean;
}) {
  const latestStatus = normalizeRequestStatus(item.request.status);

  return (
    <article className="rounded-[24px] border border-black/10 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold text-black">{item.seriesTitle}</h3>
            <span
              className={[
                "rounded-full border px-3 py-1 text-xs",
                getRequestStatusClass(latestStatus),
              ].join(" ")}
            >
              {getRequestStatusLabel(latestStatus)}
            </span>
          </div>

          <p className="mt-3 text-sm leading-7 text-neutral-500">
            直近申請日時: {formatDateTime(item.request.created_at)}
          </p>

          <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-neutral-700">
            {pickText(item.request.request_message) || "申請メッセージは未入力。"}
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href={buildWorkPath(item.seriesId)}
            className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm text-neutral-700 transition hover:bg-neutral-50"
          >
            作品ページ
          </Link>

          <Link
            href={
              latestStatus === "approved"
                ? buildRecordingStartHref(
                    item.seriesId,
                    hasRecordingGlobalConsent
                )  
                : buildRecordingRequestPath(item.seriesId)
            }
            className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm text-neutral-700 transition hover:bg-neutral-50"
          >
            {latestStatus === "approved" ? "制作開始" : "申請ページ"}
          </Link>
        </div>
      </div>
    </article>
  );
}

export default async function RecordPortalPage({ searchParams }: PageProps) {
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
  const normalizedQuery = normalizeSearchText(query);

  const showAllTags = pickText(resolvedSearchParams?.showTags) === "1";
  const showAllGenres = pickText(resolvedSearchParams?.showGenres) === "1";

  const discoverableSeries = await fetchDiscoverableSeries(supabase);
  const myRequests = await fetchMyRecordingRequests(supabase, user?.id ?? null);
  const myBookmarks = await fetchMyBookmarks(supabase, user?.id ?? null);
  const mySubmittedSeriesIds = await fetchMySubmittedSeriesIds(user?.id ?? null);
  const hasRecordingGlobalConsent = await fetchMyRecordingGlobalConsent(
    supabase,
    user?.id ?? null
  );

  const latestRequestMap = buildLatestRequestMap(myRequests);
  const bookmarkedSeriesIds = new Set(
    myBookmarks
      .map((row) => pickText(row.series_id))
      .filter((value) => value.length > 0)
  );

  const popularityDataset = await fetchSeriesPopularityDataset(
    discoverableSeries.map((series) => series.id)
  );
  const popularityMap = buildSeriesPopularityMap(popularityDataset);

  const catalogItems = sortCatalogItems(
    discoverableSeries.map((series) =>
      buildCatalogItem({
        series,
        latestRequestMap,
        bookmarkedSeriesIds,
        submittedSeriesIds: mySubmittedSeriesIds,
        popularity:
          popularityMap.get(series.id) ?? createEmptyPopularityMetrics(series.id),
      })
    ),
    order
  );

  const availableTags = buildAvailableTags(catalogItems);
  const availableGenres = buildAvailableGenres(catalogItems);

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

  const filteredCatalogItems = sortCatalogItems(
    catalogItems.filter(
      (item) =>
        matchesFilter(item, activeFilter) &&
        matchesSearch({
          item,
          query: normalizedQuery,
          selectedTagTokens,
          selectedGenreTokens,
          startAt,
          endAt,
        })
    ),
    order
  );

  const submittedItems = sortCatalogItems(
    catalogItems.filter((item) => item.isSubmitted),
    order
  ).slice(0, 5);

  const bookmarkedItems = sortCatalogItems(
    catalogItems.filter((item) => item.isBookmarked),
    order
  ).slice(0, 5);

  const requestItems = Array.from(latestRequestMap.entries())
    .map(([seriesId, request]) => {
      const matched = catalogItems.find((item) => item.series.id === seriesId);
      if (!matched) {
        return null;
      }

      return {
        seriesId,
        request,
        seriesTitle: matched.title,
        permissionMode: matched.permissionMode,
      } satisfies RequestListItem;
    })
    .filter((item): item is RequestListItem => item !== null)
    .sort(
      (left, right) =>
        getCreatedAtScore(right.request.created_at) -
        getCreatedAtScore(left.request.created_at)
    )
    .slice(0, 5);

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
              href="#record-submitted"
              className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm text-neutral-700 transition hover:bg-neutral-50"
            >
              投稿朗読作品
            </a>
            <a
              href="#record-bookmarked"
              className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm text-neutral-700 transition hover:bg-neutral-50"
            >
              ブックマーク作品
            </a>
            <a
              href="#record-requests"
              className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm text-neutral-700 transition hover:bg-neutral-50"
            >
              朗読状況
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
          />
        </div>

        <div className="mt-6 grid gap-6">

          <SectionFrame
            id="record-search-results"
            label="SEARCH RESULTS"
            title="検索結果"
            description={FILTER_META[activeFilter].description}
            action={
              <SearchNavButton
                href={buildRecordSearchHref({
                  q: query,
                  filter: activeFilter,
                  selectedTags: selectedTagLabels,
                  selectedGenres: selectedGenreLabels,
                  order,
                  start: selectedStartInput,
                  end: selectedEndInput,
                  showTags: showAllTags,
                  showGenres: showAllGenres,
                })}
                scrollTargetId="record-search"
                className="rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-sm text-black transition hover:bg-sky-100"
              >
                上の検索へ
              </SearchNavButton>
            }
          >
            <div className="mb-4 rounded-2xl border border-black/10 bg-neutral-50 px-4 py-4 text-sm leading-7 text-neutral-600">
              フィルタ: {FILTER_META[activeFilter].label}
              <br />
              検索語: {query ? `「${query}」` : "未入力"}
              <br />
              タグ: {selectedTagLabels.length > 0 ? selectedTagLabels.join(" / ") : "未指定"}
              <br />
              ジャンル:{" "}
              {selectedGenreLabels.length > 0
                ? selectedGenreLabels.join(" / ")
                : "未指定"}
              <br />
              並び順:{" "}
              {order === "updated"
                ? "更新順"
                : order === "narration"
                  ? "朗読視聴順"
                  : "人気順"}
            </div>

            {filteredCatalogItems.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-black/15 bg-neutral-50 px-4 py-4 text-sm leading-7 text-neutral-600">
                条件に合う朗読関連作品はない。
              </div>
            ) : (
              <div className="grid gap-4">
                {filteredCatalogItems.map((item) => (
                  <RecordCatalogCard
                    key={item.series.id}
                    item={item}
                    hasRecordingGlobalConsent={hasRecordingGlobalConsent}
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