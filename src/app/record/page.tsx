import type { ReactNode } from "react";
import Link from "next/link";
import PublicWorkBoardCard from "@/components/public/PublicWorkBoardCard";
import {
  buildSeriesPopularityMap,
  createEmptyPopularityMetrics,
  fetchSeriesPopularityDataset,
  type SeriesPopularityMetrics,
} from "@/lib/popularity";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  buildRecordingEntryPath,
  buildRecordingRequestPath,
  buildWorkPath,
  normalizeRecordingPermissionMode,
  type RecordingPermissionMode,
} from "@/lib/recording/recordingEntry";
import {
  getSeriesGenres,
  getSeriesPublicationStatus,
  pickText,
  type SeriesRow,
} from "@/features/write/writeShared";

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
  }>;
};

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;
type RequestStatus = "pending" | "approved" | "rejected" | "cancelled";
type OrderKey = "popular" | "updated";
type RecordFilter =
  | "all"
  | "submitted"
  | "bookmarked"
  | "ready"
  | "approval"
  | "pending"
  | "approved"
  | "requested";

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
  created_at?: string | null;
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
  createdAtValue: number;
  popularity: SeriesPopularityMetrics;
  searchText: string;
};

type RequestListItem = {
  seriesId: string;
  request: RecordingRequestRow;
  seriesTitle: string;
  permissionMode: RecordingPermissionMode;
};

const adminSupabase = createAdminClient();

const FILTER_OPTIONS: Array<{
  value: RecordFilter;
  label: string;
  description: string;
}> = [
  {
    value: "all",
    label: "すべて",
    description: "公開中の朗読関連作品をまとめて見る。",
  },
  {
    value: "submitted",
    label: "投稿済",
    description: "自分が朗読投稿済みの作品だけを見る。",
  },
  {
    value: "ready",
    label: "朗読可",
    description: "今すぐ朗読制作へ進める作品だけを見る。",
  },
  {
    value: "approval",
    label: "申請制",
    description: "承認制で申請が必要な作品だけを見る。",
  },
  {
    value: "pending",
    label: "申請中",
    description: "自分が承認待ちの作品だけを見る。",
  },
  {
    value: "approved",
    label: "承認済み",
    description: "自分が承認済みの作品だけを見る。",
  },
];

function normalizeRequestStatus(value: unknown): RequestStatus | null {
  if (value === "pending") return "pending";
  if (value === "approved") return "approved";
  if (value === "rejected") return "rejected";
  if (value === "cancelled") return "cancelled";
  return null;
}

function normalizeRecordFilter(value: unknown): RecordFilter {
  if (value === "submitted") return "submitted";
  if (value === "bookmarked") return "bookmarked";
  if (value === "ready") return "ready";
  if (value === "approval") return "approval";
  if (value === "pending") return "pending";
  if (value === "approved") return "approved";
  if (value === "requested") return "requested";
  return "all";
}

function normalizeOrder(value: unknown): OrderKey {
  if (value === "updated" || value === "latest") {
    return "updated";
  }

  return "popular";
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
    .slice(0, 5);
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

function normalizeSearchText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
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

function getPermissionLabel(mode: RecordingPermissionMode): string {
  if (mode === "open") return "自由朗読";
  if (mode === "approval_required") return "承認制";
  return "朗読停止";
}

function getPermissionClass(mode: RecordingPermissionMode): string {
  if (mode === "open") {
    return "border-emerald-400/20 bg-emerald-400/10 text-emerald-200";
  }

  if (mode === "approval_required") {
    return "border-amber-400/20 bg-amber-400/10 text-amber-200";
  }

  return "border-white/10 bg-white/5 text-neutral-400";
}

function getRequestStatusLabel(status: RequestStatus | null): string {
  if (status === "pending") return "申請中";
  if (status === "approved") return "承認済み";
  if (status === "rejected") return "却下";
  if (status === "cancelled") return "取消済み";
  return "未申請";
}

function getRequestStatusClass(status: RequestStatus | null): string {
  if (status === "pending") {
    return "border-amber-400/20 bg-amber-400/10 text-amber-200";
  }

  if (status === "approved") {
    return "border-emerald-400/20 bg-emerald-400/10 text-emerald-200";
  }

  if (status === "rejected") {
    return "border-red-400/20 bg-red-400/10 text-red-200";
  }

  if (status === "cancelled") {
    return "border-white/10 bg-white/5 text-neutral-300";
  }

  return "border-white/10 bg-white/5 text-neutral-500";
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

function buildRecordSearchHref(args: {
  q?: string;
  filter?: RecordFilter;
  selectedTags?: string[];
  selectedGenres?: string[];
  order?: OrderKey;
  start?: string;
  end?: string;
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

  const queryString = params.toString();
  const base = queryString ? `/record?${queryString}` : "/record";

  return args.anchor ? `${base}#${args.anchor}` : base;
}

async function fetchDiscoverableSeries(
  supabase: SupabaseClient
): Promise<SeriesRow[]> {
  const firstTry = await supabase
    .from("series")
    .select("*")
    .in("recording_permission_mode", ["open", "approval_required"])
    .order("created_at", { ascending: false });

  const rows =
    !firstTry.error
      ? ((firstTry.data ?? []) as SeriesRow[])
      : (
          (
            await supabase
              .from("series")
              .select("*")
              .order("created_at", { ascending: false })
          ).data ?? []
        ) as SeriesRow[];

  return rows.filter((series) => {
    const permissionMode = normalizeRecordingPermissionMode(
      series.recording_permission_mode
    );

    return (
      getSeriesPublicationStatus(series) === "public" &&
      (permissionMode === "open" || permissionMode === "approval_required")
    );
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
  const isReady = permissionMode === "open" || latestStatus === "approved";
  const isSubmitted = submittedSeriesIds.has(series.id);
  const isBookmarked = bookmarkedSeriesIds.has(series.id);
  const tags = getSeriesTags(series);
  const genres = getSeriesGenres(series);
  const createdAtValue = getCreatedAtScore(
    pickText(series.updated_at, series.created_at)
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
    createdAtValue,
    popularity,
    searchText: normalizeSearchText(
      [
        title,
        summary,
        getPermissionLabel(permissionMode),
        getRequestStatusLabel(latestStatus),
        tags.join(" "),
        genres.join(" "),
      ].join(" ")
    ),
  };
}

function matchesFilter(item: CatalogItem, filter: RecordFilter): boolean {
  if (filter === "all") return true;
  if (filter === "submitted") return item.isSubmitted;
  if (filter === "bookmarked") return item.isBookmarked;
  if (filter === "ready") return item.isReady;
  if (filter === "approval") return item.permissionMode === "approval_required";
  if (filter === "pending") return item.latestStatus === "pending";
  if (filter === "approved") return item.latestStatus === "approved";
  if (filter === "requested") return item.latestStatus !== null;
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
    (item.createdAtValue >= Math.min(startAt, endAt) &&
      item.createdAtValue <= Math.max(startAt, endAt));

  return queryOk && tagOk && genreOk && dateOk;
}

function sortCatalogItems(items: CatalogItem[], order: OrderKey): CatalogItem[] {
  return [...items].sort((left, right) => {
    if (order === "updated") {
      if (right.createdAtValue !== left.createdAtValue) {
        return right.createdAtValue - left.createdAtValue;
      }
    } else {
      if (
        right.popularity.popularityScore !== left.popularity.popularityScore
      ) {
        return (
          right.popularity.popularityScore - left.popularity.popularityScore
        );
      }

      if (right.popularity.viewCount !== left.popularity.viewCount) {
        return right.popularity.viewCount - left.popularity.viewCount;
      }
    }

    if (Number(right.isReady) !== Number(left.isReady)) {
      return Number(right.isReady) - Number(left.isReady);
    }

    return left.title.localeCompare(right.title, "ja");
  });
}

function getPrimaryAction(item: CatalogItem): {
  href: string;
  label: string;
  className: string;
} {
  if (item.isReady) {
    return {
      href: buildRecordingEntryPath(item.series.id),
      label: "朗読制作へ",
      className:
        "rounded-full bg-white px-4 py-2 text-sm font-semibold text-black transition hover:opacity-90",
    };
  }

  if (item.latestStatus === "pending") {
    return {
      href: buildRecordingRequestPath(item.series.id),
      label: "申請状況を見る",
      className:
        "rounded-full border border-amber-400/20 bg-amber-400/10 px-4 py-2 text-sm text-amber-200 transition hover:bg-amber-400/20",
    };
  }

  if (item.latestStatus === "approved") {
    return {
      href: buildRecordingEntryPath(item.series.id),
      label: "制作開始",
      className:
        "rounded-full bg-white px-4 py-2 text-sm font-semibold text-black transition hover:opacity-90",
    };
  }

  return {
    href: buildRecordingRequestPath(item.series.id),
    label: "朗読申請へ",
    className:
      "rounded-full border border-amber-400/20 bg-amber-400/10 px-4 py-2 text-sm text-amber-200 transition hover:bg-amber-400/20",
  };
}

function SectionCard({
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
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className="rounded-[28px] border border-white/10 bg-black/20 p-5 scroll-mt-24"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs tracking-[0.18em] text-neutral-500">{label}</p>
          <h2 className="mt-2 text-xl font-semibold text-white">{title}</h2>
          {description ? (
            <p className="mt-3 text-sm leading-7 text-neutral-400">
              {description}
            </p>
          ) : null}
        </div>

        {action ? <div>{action}</div> : null}
      </div>

      <div className="mt-4">{children}</div>
    </section>
  );
}

function QuickLinkCard({
  href,
  label,
  value,
  description,
}: {
  href: string;
  label: string;
  value: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-[24px] border border-white/10 bg-black/20 p-5 transition hover:bg-white/[0.06]"
    >
      <p className="text-xs tracking-[0.18em] text-neutral-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-white">{value}</p>
      <p className="mt-2 text-sm leading-7 text-neutral-400">{description}</p>
    </Link>
  );
}

function RecordCatalogCard({ item }: { item: CatalogItem }) {
  const primaryAction = getPrimaryAction(item);

  return (
    <article className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="text-xl font-semibold text-white">{item.title}</h3>

            <span
              className={[
                "rounded-full border px-3 py-1 text-sm",
                getPermissionClass(item.permissionMode),
              ].join(" ")}
            >
              {getPermissionLabel(item.permissionMode)}
            </span>

            <span
              className={[
                "rounded-full border px-3 py-1 text-sm",
                getRequestStatusClass(item.latestStatus),
              ].join(" ")}
            >
              自分: {getRequestStatusLabel(item.latestStatus)}
            </span>

            {item.isSubmitted ? (
              <span className="rounded-full border border-sky-400/20 bg-sky-400/10 px-3 py-1 text-sm text-sky-200">
                投稿済
              </span>
            ) : null}

            {item.isBookmarked ? (
              <span className="rounded-full border border-fuchsia-400/20 bg-fuchsia-400/10 px-3 py-1 text-sm text-fuchsia-200">
                ブックマーク
              </span>
            ) : null}
          </div>

          <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-neutral-300">
            {item.summary}
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            {item.tags.length > 0
              ? item.tags.slice(0, 6).map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-sm text-neutral-300"
                  >
                    {tag}
                  </span>
                ))
              : null}

            {item.genres.length > 0
              ? item.genres.slice(0, 4).map((genre) => (
                  <span
                    key={genre}
                    className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-sm text-neutral-400"
                  >
                    {genre}
                  </span>
                ))
              : null}
          </div>

          <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm leading-7 text-neutral-400">
            人気値: {Math.round(item.popularity.popularityScore * 100) / 100}
            <br />
            閲覧: {item.popularity.viewCount} / いいね: {item.popularity.likeCount} / ブックマーク:{" "}
            {item.popularity.bookmarkCount}
            <br />
            直近申請日時: {formatDateTime(item.latestRequest?.created_at)}
            <br />
            申請文:
            <br />
            {pickText(item.latestRequest?.request_message) || "まだ申請メッセージはない。"}
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href={buildWorkPath(item.series.id)}
            className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-neutral-200 transition hover:bg-white hover:text-black"
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

function RequestStatusCard({ item }: { item: RequestListItem }) {
  const latestStatus = normalizeRequestStatus(item.request.status);

  return (
    <article className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="text-lg font-semibold text-white">{item.seriesTitle}</h3>
            <span
              className={[
                "rounded-full border px-3 py-1 text-sm",
                getRequestStatusClass(latestStatus),
              ].join(" ")}
            >
              {getRequestStatusLabel(latestStatus)}
            </span>
            <span
              className={[
                "rounded-full border px-3 py-1 text-sm",
                getPermissionClass(item.permissionMode),
              ].join(" ")}
            >
              {getPermissionLabel(item.permissionMode)}
            </span>
          </div>

          <p className="mt-3 text-sm leading-7 text-neutral-400">
            直近申請日時: {formatDateTime(item.request.created_at)}
          </p>

          <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-neutral-300">
            {pickText(item.request.request_message) || "申請メッセージは未入力。"}
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href={buildWorkPath(item.seriesId)}
            className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-neutral-200 transition hover:bg-white hover:text-black"
          >
            作品ページ
          </Link>

          <Link
            href={
              latestStatus === "approved"
                ? buildRecordingEntryPath(item.seriesId)
                : buildRecordingRequestPath(item.seriesId)
            }
            className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-neutral-200 transition hover:bg-white hover:text-black"
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
  const order = normalizeOrder(
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

  const startInput = pickText(resolvedSearchParams?.start);
  const endInput = pickText(resolvedSearchParams?.end);
  const startAt = parseDateStart(startInput);
  const endAt = parseDateEnd(endInput);

  const discoverableSeries = await fetchDiscoverableSeries(supabase);
  const myRequests = await fetchMyRecordingRequests(supabase, user?.id ?? null);
  const myBookmarks = await fetchMyBookmarks(supabase, user?.id ?? null);
  const mySubmittedSeriesIds = await fetchMySubmittedSeriesIds(user?.id ?? null);

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

  const filteredCatalogItems = catalogItems.filter((item) =>
    matchesFilter(item, activeFilter) &&
    matchesSearch({
      item,
      query: normalizedQuery,
      selectedTagTokens,
      selectedGenreTokens,
      startAt,
      endAt,
    })
  );

  const submittedItems = catalogItems.filter((item) => item.isSubmitted).slice(0, 5);
  const bookmarkedItems = catalogItems.filter((item) => item.isBookmarked).slice(0, 5);

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

  const openCount = catalogItems.filter((item) => item.permissionMode === "open").length;
  const approvalCount = catalogItems.filter(
    (item) => item.permissionMode === "approval_required"
  ).length;
  const readyCount = catalogItems.filter((item) => item.isReady).length;
  const pendingCount = catalogItems.filter((item) => item.latestStatus === "pending").length;
  const approvedCount = catalogItems.filter(
    (item) => item.latestStatus === "approved"
  ).length;

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-neutral-100">
      <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-4 text-sm text-neutral-500">
          <Link href="/" className="hover:text-neutral-300">
            TOP
          </Link>
          <span className="mx-2">/</span>
          <span className="text-neutral-300">朗読ページ</span>
        </div>

        <section className="overflow-hidden rounded-[32px] border border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.02] shadow-2xl">
          <div className="border-b border-white/10 px-5 py-6 sm:px-8">
            <p className="text-xs tracking-[0.22em] text-neutral-500">
              LIB READ RECORD MANAGEMENT
            </p>

            <h1 className="mt-3 text-3xl font-bold text-white sm:text-4xl">
              朗読管理トップ
            </h1>

            <p className="mt-4 max-w-4xl text-sm leading-7 text-neutral-300 sm:text-base">
              ここでは朗読に関する管理導線をまとめて扱う。
              作品検索、朗読投稿済み作品、ブックマーク作品、申請状況をこのページでまとめて確認できる。
            </p>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs text-neutral-300">
                {user ? `signed in: ${pickText(user.email) || "ログイン中"}` : "guest mode"}
              </span>

              {user ? (
                <Link
                  href="/mypage"
                  className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm text-neutral-200 transition hover:bg-white hover:text-black"
                >
                  マイページへ
                </Link>
              ) : (
                <Link
                  href="/login?next=%2Frecord"
                  className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm text-neutral-200 transition hover:bg-white hover:text-black"
                >
                  ログインして自分の管理情報を見る
                </Link>
              )}
            </div>
          </div>

          <div className="grid gap-6 px-5 py-6 sm:px-8">
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <QuickLinkCard
                href="#record-search"
                label="SEARCH"
                value={String(filteredCatalogItems.length)}
                description="条件付きで朗読関連作品を検索"
              />
              <QuickLinkCard
                href="#record-submitted"
                label="SUBMITTED"
                value={String(submittedItems.length)}
                description="自分が投稿済みの朗読作品"
              />
              <QuickLinkCard
                href="#record-bookmarked"
                label="BOOKMARK"
                value={String(bookmarkedItems.length)}
                description="自分が保存した作品"
              />
              <QuickLinkCard
                href="#record-requests"
                label="REQUESTS"
                value={String(requestItems.length)}
                description="自分の申請状況"
              />
              <QuickLinkCard
                href="#record-search-results"
                label="READY"
                value={String(readyCount)}
                description="今すぐ朗読制作へ進める作品"
              />
            </section>

            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <div className="rounded-[28px] border border-white/10 bg-black/20 p-5">
                <p className="text-xs tracking-[0.18em] text-neutral-500">OPEN</p>
                <p className="mt-2 text-3xl font-semibold text-white">{openCount}</p>
                <p className="mt-2 text-sm text-neutral-400">
                  申請なしで朗読できる作品
                </p>
              </div>

              <div className="rounded-[28px] border border-white/10 bg-black/20 p-5">
                <p className="text-xs tracking-[0.18em] text-neutral-500">APPROVAL</p>
                <p className="mt-2 text-3xl font-semibold text-white">{approvalCount}</p>
                <p className="mt-2 text-sm text-neutral-400">
                  承認制の作品
                </p>
              </div>

              <div className="rounded-[28px] border border-white/10 bg-black/20 p-5">
                <p className="text-xs tracking-[0.18em] text-neutral-500">READY</p>
                <p className="mt-2 text-3xl font-semibold text-white">{readyCount}</p>
                <p className="mt-2 text-sm text-neutral-400">
                  今すぐ朗読制作へ進める作品
                </p>
              </div>

              <div className="rounded-[28px] border border-white/10 bg-black/20 p-5">
                <p className="text-xs tracking-[0.18em] text-neutral-500">PENDING</p>
                <p className="mt-2 text-3xl font-semibold text-white">{pendingCount}</p>
                <p className="mt-2 text-sm text-neutral-400">
                  自分が承認待ちの作品
                </p>
              </div>

              <div className="rounded-[28px] border border-white/10 bg-black/20 p-5">
                <p className="text-xs tracking-[0.18em] text-neutral-500">APPROVED</p>
                <p className="mt-2 text-3xl font-semibold text-white">{approvedCount}</p>
                <p className="mt-2 text-sm text-neutral-400">
                  自分が承認済みの作品
                </p>
              </div>
            </section>

            <SectionCard
              id="record-search"
              label="SEARCH"
              title="朗読作品検索"
              description="朗読関連の主フィルタに加えて、検索ページ相当の検索条件で絞り込める。検索後はページ下部の検索結果へ飛ぶ。"
            >
              <form
                action="/record#record-search-results"
                method="get"
                className="grid gap-4"
              >
                <div className="grid gap-3 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
                  <input
                    type="search"
                    name="q"
                    defaultValue={query}
                    placeholder="作品名・概要・タグなど"
                    className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-neutral-500"
                  />

                  <input
                    type="text"
                    name="tags"
                    defaultValue={selectedTagLabels.join(",")}
                    placeholder="タグをカンマ区切り"
                    className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-neutral-500"
                  />

                  <input
                    type="text"
                    name="genres"
                    defaultValue={selectedGenreLabels.join(",")}
                    placeholder="ジャンルをカンマ区切り"
                    className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-neutral-500"
                  />
                </div>

                <div className="grid gap-3 xl:grid-cols-4">
                  <select
                    name="filter"
                    defaultValue={activeFilter}
                    className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none"
                  >
                    {FILTER_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value} className="bg-[#111] text-white">
                        {option.label}
                      </option>
                    ))}
                  </select>

                  <select
                    name="order"
                    defaultValue={order}
                    className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none"
                  >
                    <option value="popular" className="bg-[#111] text-white">
                      人気順
                    </option>
                    <option value="updated" className="bg-[#111] text-white">
                      更新順
                    </option>
                  </select>

                  <input
                    type="date"
                    name="start"
                    defaultValue={startInput}
                    className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none"
                  />

                  <input
                    type="date"
                    name="end"
                    defaultValue={endInput}
                    className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none"
                  />
                </div>

                <div className="flex flex-wrap gap-2">
                  {FILTER_OPTIONS.map((option) => (
                    <Link
                      key={option.value}
                      href={buildRecordSearchHref({
                        q: query,
                        filter: option.value,
                        selectedTags: selectedTagLabels,
                        selectedGenres: selectedGenreLabels,
                        order,
                        start: startInput,
                        end: endInput,
                        anchor: "record-search-results",
                      })}
                      className={[
                        "rounded-full border px-4 py-2 text-sm transition",
                        activeFilter === option.value
                          ? "border-white bg-white text-black"
                          : "border-white/10 bg-white/5 text-neutral-300 hover:bg-white hover:text-black",
                      ].join(" ")}
                    >
                      {option.label}
                    </Link>
                  ))}
                </div>

                <div className="flex flex-wrap gap-3">
                  <button
                    type="submit"
                    className="rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black transition hover:opacity-90"
                  >
                    検索して結果へ移動
                  </button>

                  <Link
                    href="/record#record-search-results"
                    className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-sm text-neutral-200 transition hover:bg-white hover:text-black"
                  >
                    条件を維持して結果を見る
                  </Link>
                </div>
              </form>
            </SectionCard>

            <SectionCard
              id="record-submitted"
              label="SUBMITTED WORKS"
              title="投稿朗読作品一覧"
              description="自分が朗読投稿済みの作品を5件まで表示。もっと見るで検索結果へ飛ぶ。"
              action={
                <Link
                  href={buildRecordSearchHref({
                    q: query,
                    filter: "submitted",
                    selectedTags: selectedTagLabels,
                    selectedGenres: selectedGenreLabels,
                    order,
                    start: startInput,
                    end: endInput,
                    anchor: "record-search-results",
                  })}
                  className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-neutral-200 transition hover:bg-white hover:text-black"
                >
                  もっと見る
                </Link>
              }
            >
              {!user ? (
                <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.03] px-4 py-4 text-sm leading-7 text-neutral-400">
                  ログインすると、自分が投稿済みの朗読作品を表示できる。
                </div>
              ) : submittedItems.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.03] px-4 py-4 text-sm leading-7 text-neutral-400">
                  まだ投稿済みの朗読作品はない。
                </div>
              ) : (
                <div className="grid gap-4">
                  {submittedItems.map((item) => (
                    <RecordCatalogCard key={item.series.id} item={item} />
                  ))}
                </div>
              )}
            </SectionCard>

            <SectionCard
              id="record-bookmarked"
              label="BOOKMARKED WORKS"
              title="ブックマーク作品"
              description="自分が保存した作品を5件まで表示。もっと見るで検索結果へ飛ぶ。"
              action={
                <Link
                  href={buildRecordSearchHref({
                    q: query,
                    filter: "bookmarked",
                    selectedTags: selectedTagLabels,
                    selectedGenres: selectedGenreLabels,
                    order,
                    start: startInput,
                    end: endInput,
                    anchor: "record-search-results",
                  })}
                  className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-neutral-200 transition hover:bg-white hover:text-black"
                >
                  もっと見る
                </Link>
              }
            >
              {!user ? (
                <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.03] px-4 py-4 text-sm leading-7 text-neutral-400">
                  ログインすると、ブックマーク作品を表示できる。
                </div>
              ) : bookmarkedItems.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.03] px-4 py-4 text-sm leading-7 text-neutral-400">
                  まだブックマーク作品はない。
                </div>
              ) : (
                <div className="grid gap-4">
                  {bookmarkedItems.map((item) => (
                    <RecordCatalogCard key={item.series.id} item={item} />
                  ))}
                </div>
              )}
            </SectionCard>

            <SectionCard
              id="record-requests"
              label="REQUEST STATUS"
              title="申請状況"
              description="自分の申請を5件まで表示。もっと見るで検索結果へ飛ぶ。"
              action={
                <Link
                  href={buildRecordSearchHref({
                    q: query,
                    filter: "requested",
                    selectedTags: selectedTagLabels,
                    selectedGenres: selectedGenreLabels,
                    order,
                    start: startInput,
                    end: endInput,
                    anchor: "record-search-results",
                  })}
                  className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-neutral-200 transition hover:bg-white hover:text-black"
                >
                  もっと見る
                </Link>
              }
            >
              {!user ? (
                <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.03] px-4 py-4 text-sm leading-7 text-neutral-400">
                  ログインすると、申請状況を表示できる。
                </div>
              ) : requestItems.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.03] px-4 py-4 text-sm leading-7 text-neutral-400">
                  まだ申請はない。
                </div>
              ) : (
                <div className="grid gap-4">
                  {requestItems.map((item) => (
                    <RequestStatusCard key={item.seriesId} item={item} />
                  ))}
                </div>
              )}
            </SectionCard>

            <SectionCard
              id="record-search-results"
              label="SEARCH RESULTS"
              title="検索結果"
              description="検索ボタンと各セクションのもっと見るはここへ飛ぶ。"
            >
              <div className="mb-4 rounded-2xl border border-white/10 bg-black/20 px-4 py-4 text-sm leading-7 text-neutral-300">
                条件:
                <br />
                フィルタ:{" "}
                {FILTER_OPTIONS.find((option) => option.value === activeFilter)?.label ??
                  "すべて"}
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
                並び順: {order === "updated" ? "更新順" : "人気順"}
              </div>

              {filteredCatalogItems.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.03] px-4 py-4 text-sm leading-7 text-neutral-400">
                  条件に合う朗読関連作品はない。
                </div>
              ) : (
                <div className="grid gap-4">
                  {filteredCatalogItems.map((item) => (
                    <RecordCatalogCard key={item.series.id} item={item} />
                  ))}
                </div>
              )}
            </SectionCard>
          </div>
        </section>
      </div>
    </main>
  );
}