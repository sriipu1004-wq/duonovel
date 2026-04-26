import Link from "next/link";
import PublicWorkBoardCard from "@/components/public/PublicWorkBoardCard";
import PublicSearchControls from "@/components/search/PublicSearchControls";
import SearchNavButton from "@/components/search/SearchNavButton";
import {
  buildSeriesPopularityMap,
  createEmptyPopularityMetrics,
  fetchSeriesPopularityDataset,
  type SeriesPopularityMetrics,
} from "@/lib/popularity";
import { getCachedPublicBaseWorkCards } from "@/lib/publicWorks";
import { pickText } from "@/features/write/writeShared";
import PublicAdSlot from "@/components/ads/PublicAdSlot";
import { createClient as createServerClient } from "@/lib/supabase/server";
import {
  getSavedFilterLabel,
  resolveSavedFilter,
} from "@/lib/searchSavedFilters";

type SearchPageProps = {
  searchParams?: Promise<{
    q?: string;
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
    shelfTab?: string;
    saved?: string;    
  }>;
};

type OrderKey = "popular" | "updated";

type ShelfTabKey =
  | "overall-popular"
  | "latest"
  | "weekly-new"
  | "narration-popular";

type WorkCard = {
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
  likeCount: number;
  bookmarkCount: number;
  viewCount: number;
  narrationPlayCount: number;
  provisionalPopularityScore: number;
};

type ShelfWorkEntry = {
  work: WorkCard;
  metrics: SeriesPopularityMetrics;
};

type TagChip = {
  value: string;
  label: string;
  count: number;
};

type GenrePlaceholderChip = {
  key: string;
  label: string;
  count: number;
};

type ShelfConfig = {
  key: string;
  title: string;
  description: string;
  order: OrderKey;
  start: string;
  end: string;
};

type GenrePlaceholderSection = {
  key: string;
  title: string;
  description: string;
};

type GenreShelfSection = {
  key: string;
  title: string;
  description: string;
  badgeLabel: string;
  href: string;
  works: WorkCard[];
  emptyMessage: string;
};

async function fetchSavedAuthorIdsForUser(args: {
  supabase: Awaited<ReturnType<typeof createServerClient>>;
  userId: string;
  tableName: "author_follows" | "author_profile_likes";
  targetColumn: "followed_author_id" | "author_id";
}): Promise<Set<string>> {
  const ownerColumn =
    args.tableName === "author_follows" ? "follower_user_id" : "user_id";

  const { data, error } = await args.supabase
    .from(args.tableName)
    .select(args.targetColumn)
    .eq(ownerColumn, args.userId);

  if (error) {
    return new Set();
  }

  return new Set(
    ((data ?? []) as Array<Record<string, unknown>>)
      .map((row) => {
        const rawValue = row[args.targetColumn];
        return typeof rawValue === "string" ? rawValue.trim() : "";
      })
      .filter((value) => value.length > 0)
  );
  }

async function fetchSavedSeriesIdsForUser(args: {
  supabase: Awaited<ReturnType<typeof createServerClient>>;
  userId: string;
  tableName: "user_series_reactions" | "reader_card_likes";
}): Promise<Set<string>> {
  if (args.tableName === "user_series_reactions") {
    const { data, error } = await args.supabase
      .from("user_series_reactions")
      .select("series_id")
      .eq("user_id", args.userId)
      .eq("reaction_type", "support");

    if (error) {
      return new Set();
    }

    return new Set(
      ((data ?? []) as Array<Record<string, unknown>>)
        .map((row) =>
          typeof row.series_id === "string" ? row.series_id.trim() : ""
        )
        .filter((value) => value.length > 0)
    );
  }

  const { data, error } = await args.supabase
    .from("reader_card_likes")
    .select("series_id")
    .eq("user_id", args.userId);

  if (error) {
    return new Set();
  }

  return new Set(
    ((data ?? []) as Array<Record<string, unknown>>)
      .map((row) =>
        typeof row.series_id === "string" ? row.series_id.trim() : ""
      )
      .filter((value) => value.length > 0)
  );
}

const TOKYO_TIMEZONE = "Asia/Tokyo";
const ONE_DAY_MS = 1000 * 60 * 60 * 24;

const PLACEHOLDER_GENRES: GenrePlaceholderChip[] = [
  { key: "fantasy", label: "ファンタジー", count: 128 },
  { key: "love", label: "恋愛", count: 121 },
  { key: "youth", label: "青春", count: 104 },
  { key: "mystery", label: "ミステリー", count: 96 },
  { key: "daily", label: "日常", count: 88 },
  { key: "sf", label: "SF", count: 75 },
  { key: "history", label: "歴史", count: 63 },
  { key: "horror", label: "ホラー", count: 51 },
  { key: "modern", label: "現代", count: 46 },
  { key: "japanese", label: "和風", count: 39 },
  { key: "battle", label: "バトル", count: 34 },
  { key: "travel", label: "旅", count: 28 },
];

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

function buildReadHref(seriesId: string, episodeNumber: number): string {
  return `/read/${seriesId}/${episodeNumber}`;
}

function buildWorkHref(seriesId: string): string {
  return `/works/${seriesId}`;
}

function buildAuthorHref(authorId: string): string {
  return `/authors/${encodeURIComponent(authorId)}`;
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

function resolveShelfTab(value: string): ShelfTabKey {
  if (value === "latest") return "latest";
  if (value === "weekly-new") return "weekly-new";
  if (value === "narration-popular") return "narration-popular";
  return "overall-popular";
}

function buildSearchHref(params: {
  q?: string;
  selectedTags?: string[];
  selectedGenres?: string[];
  saved?: string;
  order?: OrderKey;
  start?: string;
  end?: string;
  showTags?: boolean;
  showGenres?: boolean;
  shelfTab?: ShelfTabKey;
}): string {
  const query = new URLSearchParams();

  if (params.q && params.q.trim().length > 0) {
    query.set("q", params.q.trim());
  }

  if (params.selectedTags && params.selectedTags.length > 0) {
    query.set("tags", params.selectedTags.join(","));
  }

  if (params.selectedGenres && params.selectedGenres.length > 0) {
    query.set("genres", params.selectedGenres.join(","));
  }

  if (params.saved && params.saved.trim().length > 0) {
    query.set("saved", params.saved.trim());
  }

  if (params.order) {
    query.set("order", params.order);
  }

  if (params.start) {
    query.set("start", params.start);
  }

  if (params.end) {
    query.set("end", params.end);
  }

  if (params.showTags) {
    query.set("showTags", "1");
  }

  if (params.showGenres) {
    query.set("showGenres", "1");
  }

  if (params.shelfTab) {
    query.set("shelfTab", params.shelfTab);
  }

  const queryString = query.toString();
  return queryString ? `/search?${queryString}` : "/search";
}

function buildSearchTarget(work: WorkCard): string {
  return [
    work.title,
    work.summary,
    work.authorName,
    work.tags.join(" "),
    work.genres.join(" "),
  ]
    .join("\n")
    .toLowerCase();
}

function buildAvailableTags(works: WorkCard[]): TagChip[] {
  const counter = new Map<string, TagChip>();

  for (const work of works) {
    const seen = new Set<string>();

    for (const tag of work.tags) {
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

  return Array.from(counter.values()).sort((a, b) => {
    if (b.count !== a.count) {
      return b.count - a.count;
    }

    return a.value.localeCompare(b.value, "ja");
  });
}

function buildAvailableGenres(works: WorkCard[]): GenrePlaceholderChip[] {
  const counter = new Map<string, GenrePlaceholderChip>();

  for (const work of works) {
    const seen = new Set<string>();

    for (const genre of work.genres) {
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

  return Array.from(counter.values()).sort((a, b) => {
    if (b.count !== a.count) {
      return b.count - a.count;
    }

    return a.label.localeCompare(b.label, "ja");
  });
}

function estimateTagChipUnits(chip: TagChip): number {
  return chip.label.length * 2 + String(chip.count).length + 8;
}

function pickTagChipsWithinBudget(chips: TagChip[], budget: number): TagChip[] {
  const picked: TagChip[] = [];
  let used = 0;

  for (const chip of chips) {
    const nextUnits = estimateTagChipUnits(chip);
    if (picked.length > 0 && used + nextUnits > budget) {
      break;
    }

    picked.push(chip);
    used += nextUnits;
  }

  return picked;
}

function estimateGenreChipUnits(chip: GenrePlaceholderChip): number {
  return chip.label.length * 2 + String(chip.count).length + 8;
}

function pickGenreChipsWithinBudget(
  chips: GenrePlaceholderChip[],
  budget: number
): GenrePlaceholderChip[] {
  const picked: GenrePlaceholderChip[] = [];
  let used = 0;

  for (const chip of chips) {
    const nextUnits = estimateGenreChipUnits(chip);
    if (picked.length > 0 && used + nextUnits > budget) {
      break;
    }

    picked.push(chip);
    used += nextUnits;
  }

  return picked;
}

function resolveOrder(value: string): OrderKey {
  if (value === "updated" || value === "latest") {
    return "updated";
  }

  return "popular";
}

function getOrderLabel(order: OrderKey): string {
  return order === "updated" ? "更新順" : "人気順";
}

function getShelfTabLabel(tab: ShelfTabKey): string {
  if (tab === "latest") return "新着更新順";
  if (tab === "weekly-new") return "週間新作おすすめ順";
  if (tab === "narration-popular") return "朗読視聴人気順";
  return "総合人気順";
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

function parseTokyoDateStart(value: string | undefined): number | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const parsed = new Date(`${value}T00:00:00+09:00`).getTime();
  return Number.isNaN(parsed) ? null : parsed;
}

function parseTokyoDateEnd(value: string | undefined): number | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const parsed = new Date(`${value}T23:59:59.999+09:00`).getTime();
  return Number.isNaN(parsed) ? null : parsed;
}

function subtractDaysClamped(endAt: number, days: number, floorAt: number): number {
  const raw = endAt - ONE_DAY_MS * Math.max(0, days - 1);
  return Math.max(floorAt, raw);
}

function sortByUpdated(works: WorkCard[]) {
  return [...works].sort((a, b) => {
    if (b.latestPostedAtValue !== a.latestPostedAtValue) {
      return b.latestPostedAtValue - a.latestPostedAtValue;
    }
    return b.createdAtValue - a.createdAtValue;
  });
}

function formatPopularityScore(value: number): number {
  return Math.round(value * 100) / 100;
}

function sortByPopular(
  works: WorkCard[],
  popularityMap?: Map<string, SeriesPopularityMetrics>
) {
  return [...works].sort((a, b) => {
    const aMetrics = popularityMap?.get(a.seriesId);
    const bMetrics = popularityMap?.get(b.seriesId);

    const aScore = aMetrics?.popularityScore ?? a.provisionalPopularityScore;
    const bScore = bMetrics?.popularityScore ?? b.provisionalPopularityScore;

    if (bScore !== aScore) {
      return bScore - aScore;
    }

    const aViewCount = aMetrics?.viewCount ?? a.viewCount;
    const bViewCount = bMetrics?.viewCount ?? b.viewCount;

    if (bViewCount !== aViewCount) {
      return bViewCount - aViewCount;
    }

    if (b.likeCount !== a.likeCount) {
      return b.likeCount - a.likeCount;
    }

    if (b.bookmarkCount !== a.bookmarkCount) {
      return b.bookmarkCount - a.bookmarkCount;
    }

    return b.latestPostedAtValue - a.latestPostedAtValue;
  });
}

function sortByNarrationPopular(
  works: WorkCard[],
  popularityMap?: Map<string, SeriesPopularityMetrics>
) {
  return [...works].sort((a, b) => {
    const aMetrics = popularityMap?.get(a.seriesId);
    const bMetrics = popularityMap?.get(b.seriesId);

    const aNarrationCount =
      aMetrics?.narrationPlayCount ?? a.narrationPlayCount;
    const bNarrationCount =
      bMetrics?.narrationPlayCount ?? b.narrationPlayCount;

    if (bNarrationCount !== aNarrationCount) {
      return bNarrationCount - aNarrationCount;
    }

    const aViewCount = aMetrics?.viewCount ?? a.viewCount;
    const bViewCount = bMetrics?.viewCount ?? b.viewCount;

    if (bViewCount !== aViewCount) {
      return bViewCount - aViewCount;
    }

    if (b.likeCount !== a.likeCount) {
      return b.likeCount - a.likeCount;
    }

    if (b.bookmarkCount !== a.bookmarkCount) {
      return b.bookmarkCount - a.bookmarkCount;
    }

    return b.latestPostedAtValue - a.latestPostedAtValue;
  });
}

function filterWorksWithNarrationActivity(
  works: WorkCard[],
  popularityMap?: Map<string, SeriesPopularityMetrics>
): WorkCard[] {
  return works.filter((work) => {
    const narrationCount =
      popularityMap?.get(work.seriesId)?.narrationPlayCount ??
      work.narrationPlayCount;

    return narrationCount > 0;
  });
}

function filterWorksByDateRange(
  works: WorkCard[],
  startAt: number,
  endAt: number
): WorkCard[] {
  const safeStart = Math.min(startAt, endAt);
  const safeEnd = Math.max(startAt, endAt);

  return works.filter(
    (work) =>
      work.latestPostedAtValue >= safeStart &&
      work.latestPostedAtValue <= safeEnd
  );
}

function sortWorks(
  works: WorkCard[],
  order: OrderKey,
  popularityMap?: Map<string, SeriesPopularityMetrics>
) {
  return order === "updated"
    ? sortByUpdated(works)
    : sortByPopular(works, popularityMap);
}

function sortWorksForShelfTab(
  works: WorkCard[],
  order: OrderKey,
  shelfTab: ShelfTabKey,
  popularityMap?: Map<string, SeriesPopularityMetrics>
) {
  if (order === "updated") {
    return sortByUpdated(works);
  }

  return shelfTab === "narration-popular"
    ? sortByNarrationPopular(works, popularityMap)
    : sortByPopular(works, popularityMap);
}

function buildGenrePlaceholderSections(
  labels: GenrePlaceholderChip[],
  description: string
): GenrePlaceholderSection[] {
  return labels.slice(0, 5).map((genre) => ({
    key: genre.key,
    title: genre.label,
    description,
  }));
}

function getWorkFirstPublicAtValue(work: WorkCard): number {
  return work.earliestPublicAtValue > 0
    ? work.earliestPublicAtValue
    : work.createdAtValue;
}

function filterWorksByGenre(
  works: WorkCard[],
  genreKey: string
): WorkCard[] {
  return works.filter((work) =>
    work.genres.some((genre) => normalizeGenreToken(genre) === genreKey)
  );
}

function buildGenreShelfSections(params: {
  genres: GenrePlaceholderChip[];
  works: WorkCard[];
  order: OrderKey;
  descriptionBuilder: (genre: GenrePlaceholderChip) => string;
  badgeLabel: string;
  hrefBuilder: (genre: GenrePlaceholderChip) => string;
  emptyMessageBuilder: (genre: GenrePlaceholderChip) => string;
}): GenreShelfSection[] {
  return params.genres.slice(0, 5).map((genre) => ({
    key: genre.key,
    title: genre.label,
    description: params.descriptionBuilder(genre),
    badgeLabel: params.badgeLabel,
    href: params.hrefBuilder(genre),
    works: sortWorks(filterWorksByGenre(params.works, genre.key), params.order).slice(
      0,
      5
    ),
    emptyMessage: params.emptyMessageBuilder(genre),
  }));
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;

  const savedFilter = resolveSavedFilter(pickText(resolvedSearchParams?.saved));
  const savedFilterLabel = savedFilter ? getSavedFilterLabel(savedFilter) : "";

  const query = pickText(resolvedSearchParams?.q);
  const selectedTagLabels = parseSelectedTagLabels(
    pickText(resolvedSearchParams?.tags),
    pickText(resolvedSearchParams?.tag)
  );
  const selectedGenreLabels = parseSelectedGenreLabels(
    pickText(resolvedSearchParams?.genres)
  );

  const order = resolveOrder(
    pickText(
      resolvedSearchParams?.order,
      resolvedSearchParams?.sort,
      resolvedSearchParams?.mode
    )
  );

  const showAllTags = pickText(resolvedSearchParams?.showTags) === "1";
  const showAllGenres = pickText(resolvedSearchParams?.showGenres) === "1";
  const shelfTab = resolveShelfTab(pickText(resolvedSearchParams?.shelfTab));

  const authSupabase = savedFilter ? await createServerClient() : null;
  const currentUser = authSupabase
    ? (await authSupabase.auth.getUser()).data.user
    : null;

  const baseWorkCards = await getCachedPublicBaseWorkCards();

  const popularityDataset = await fetchSeriesPopularityDataset(
    baseWorkCards.map((work) => work.seriesId)
  );

  const currentPopularityMap = buildSeriesPopularityMap(popularityDataset);

  const workCards: WorkCard[] = baseWorkCards.map((work) => {
    const currentPopularity =
      currentPopularityMap.get(work.seriesId) ??
      createEmptyPopularityMetrics(work.seriesId);

    return {
      ...work,
      likeCount: currentPopularity.likeCount,
      bookmarkCount: currentPopularity.bookmarkCount,
      viewCount: currentPopularity.viewCount,
      narrationPlayCount: currentPopularity.narrationPlayCount,
      provisionalPopularityScore: currentPopularity.popularityScore,
    };
  });

  let savedAuthorIds = new Set<string>();
  let savedSeriesIds = new Set<string>();

  if (savedFilter && currentUser && authSupabase) {
    if (savedFilter === "followed-authors") {
      savedAuthorIds = await fetchSavedAuthorIdsForUser({
        supabase: authSupabase,
        userId: currentUser.id,
        tableName: "author_follows",
        targetColumn: "followed_author_id",
      });
    } else if (savedFilter === "liked-authors") {
      savedAuthorIds = await fetchSavedAuthorIdsForUser({
        supabase: authSupabase,
        userId: currentUser.id,
        tableName: "author_profile_likes",
        targetColumn: "author_id",
      });
    } else if (savedFilter === "liked-works") {
      savedSeriesIds = await fetchSavedSeriesIdsForUser({
        supabase: authSupabase,
        userId: currentUser.id,
        tableName: "user_series_reactions",
      });
    } else if (savedFilter === "liked-readers") {
      savedSeriesIds = await fetchSavedSeriesIdsForUser({
        supabase: authSupabase,
        userId: currentUser.id,
        tableName: "reader_card_likes",
      });
    }
  }

  const savedFilterRequiresLogin = Boolean(savedFilter && !currentUser);  

  const oldestPublicAtValue =
    workCards.reduce((min, work) => {
      const candidate =
        work.earliestPublicAtValue > 0 ? work.earliestPublicAtValue : work.createdAtValue;
      if (candidate <= 0) return min;
      return min === 0 ? candidate : Math.min(min, candidate);
    }, 0) || Date.now();

  const defaultStartInput = formatInputDate(oldestPublicAtValue);
  const defaultEndInput = formatInputDate(Date.now());

  const selectedStartAtValue =
    parseTokyoDateStart(pickText(resolvedSearchParams?.start)) ?? oldestPublicAtValue;
  const selectedEndAtValue =
    parseTokyoDateEnd(pickText(resolvedSearchParams?.end)) ?? Date.now();

  const safeStartAtValue = Math.min(selectedStartAtValue, selectedEndAtValue);
  const safeEndAtValue = Math.max(selectedStartAtValue, selectedEndAtValue);

  const selectedStartInput = formatInputDate(safeStartAtValue);
  const selectedEndInput = formatInputDate(safeEndAtValue);

  const normalizedQuery = query.trim().toLowerCase();
  const selectedTagTokens = selectedTagLabels.map(normalizeTagToken);
  const selectedGenreTokens = selectedGenreLabels.map(normalizeGenreToken);

  const selectedPopularityMap =
    order === "popular"
      ? buildSeriesPopularityMap(popularityDataset, {
          startAtValue: safeStartAtValue,
          endAtValue: safeEndAtValue,
        })
      : null;

  const filteredWorks = workCards.filter((work) => {
    const queryOk =
      normalizedQuery.length === 0 ||
      buildSearchTarget(work).includes(normalizedQuery);

    const tagOk =
      selectedTagTokens.length === 0 ||
      selectedTagTokens.every((selectedToken) =>
        work.tags.some((tag) => normalizeTagToken(tag) === selectedToken)
      );

    const genreOk =
      selectedGenreTokens.length === 0 ||
      selectedGenreTokens.every((selectedToken) =>
        work.genres.some(
          (genre) => normalizeGenreToken(genre) === selectedToken
        )
      );

    const dateOk =
      order === "popular"
        ? true
        : work.latestPostedAtValue >= safeStartAtValue &&
          work.latestPostedAtValue <= safeEndAtValue;

    const savedOk = (() => {
      if (!savedFilter) {
        return true;
      }

      if (savedFilterRequiresLogin) {
        return false;
      }

      if (
        savedFilter === "followed-authors" ||
        savedFilter === "liked-authors"
      ) {
        return !!work.authorId && savedAuthorIds.has(work.authorId);
      }

      return savedSeriesIds.has(work.seriesId);
    })();

    return queryOk && tagOk && genreOk && dateOk && savedOk;
  });

  const shelfFilteredWorks =
    shelfTab === "narration-popular"
      ? filterWorksWithNarrationActivity(
          filteredWorks,
          selectedPopularityMap ?? undefined
        )
      : filteredWorks;

  const sortedWorks = sortWorksForShelfTab(
    shelfFilteredWorks,
    order,
    shelfTab,
    selectedPopularityMap ?? undefined
  );

  const currentResultsHeading = savedFilterLabel
    ? `${savedFilterLabel} の一覧`
    : "検索結果";

  const currentResultsDescription = `${
    savedFilterLabel ? `保存条件: ${savedFilterLabel} / ` : ""
  }指定期間: ${selectedStartInput} 〜 ${selectedEndInput} / 並び順: ${getOrderLabel(order)}`;

  const hasCustomPeriod =
    selectedStartInput !== defaultStartInput ||
    selectedEndInput !== defaultEndInput;

  const activeConditionCount =
    (query.trim().length > 0 ? 1 : 0) +
    selectedGenreLabels.length +
    selectedTagLabels.length +
    (savedFilter ? 1 : 0) +
    (order !== "popular" ? 1 : 0) +
    (hasCustomPeriod ? 1 : 0);

  const hasActiveConditions = activeConditionCount > 0;

  const clearConditionsHref = buildSearchHref({
    saved: savedFilter ?? "",
    shelfTab,
    showTags: showAllTags,
    showGenres: showAllGenres,
  });

  const resetPeriodHref = buildSearchHref({
    q: query,
    selectedTags: selectedTagLabels,
    selectedGenres: selectedGenreLabels,
    saved: savedFilter ?? "",
    order,
    start: defaultStartInput,
    end: defaultEndInput,
    showTags: showAllTags,
    showGenres: showAllGenres,
    shelfTab,
  });

  const availableTags = buildAvailableTags(workCards);
  const availableGenres = buildAvailableGenres(workCards);
  const genreCandidateSource =
    availableGenres.length > 0 ? availableGenres : PLACEHOLDER_GENRES;

  const collapsedTagPreview = availableTags.slice(0, 10);
  const collapsedGenrePreview = genreCandidateSource.slice(0, 7);

  const hasHiddenTags = availableTags.length > 10;
  const hasHiddenGenres = genreCandidateSource.length > 7;

  const visibleTagChips = showAllTags ? availableTags : collapsedTagPreview;
  const visibleGenreChips = showAllGenres
    ? genreCandidateSource
    : collapsedGenrePreview;

  const isOverallShelfTab = shelfTab === "overall-popular";
  const isLatestShelfTab = shelfTab === "latest";
  const isWeeklyNewShelfTab = shelfTab === "weekly-new";
  const isNarrationShelfTab = shelfTab === "narration-popular";

  const overallShelfConfigs: ShelfConfig[] = isOverallShelfTab
    ? [
        {
          key: "popular-daily",
          title: "日間",
          description: "直近1日で獲得した人気値順で表示。",
          order: "popular",
          start: formatInputDate(
            subtractDaysClamped(Date.now(), 1, oldestPublicAtValue)
          ),
          end: defaultEndInput,
        },
        {
          key: "popular-weekly",
          title: "週間",
          description: "直近7日で獲得した人気値順で表示。",
          order: "popular",
          start: formatInputDate(
            subtractDaysClamped(Date.now(), 7, oldestPublicAtValue)
          ),
          end: defaultEndInput,
        },
        {
          key: "popular-monthly",
          title: "月間",
          description: "直近30日で獲得した人気値順で表示。",
          order: "popular",
          start: formatInputDate(
            subtractDaysClamped(Date.now(), 30, oldestPublicAtValue)
          ),
          end: defaultEndInput,
        },
        {
          key: "popular-quarterly",
          title: "四半期",
          description: "直近90日で獲得した人気値順で表示。",
          order: "popular",
          start: formatInputDate(
            subtractDaysClamped(Date.now(), 90, oldestPublicAtValue)
          ),
          end: defaultEndInput,
        },
        {
          key: "popular-yearly",
          title: "年間",
          description: "直近365日で獲得した人気値順で表示。",
          order: "popular",
          start: formatInputDate(
            subtractDaysClamped(Date.now(), 365, oldestPublicAtValue)
          ),
          end: defaultEndInput,
        },
        {
          key: "popular-all",
          title: "累計",
          description: "全期間の人気値順で表示。",
          order: "popular",
          start: defaultStartInput,
          end: defaultEndInput,
        },
      ]
    : [];

  const overallShelves = isOverallShelfTab
    ? overallShelfConfigs.map((config) => {
        const startAt = parseTokyoDateStart(config.start) ?? oldestPublicAtValue;
        const endAt = parseTokyoDateEnd(config.end) ?? Date.now();

        const shelfPopularityMap = buildSeriesPopularityMap(popularityDataset, {
          startAtValue: startAt,
          endAtValue: endAt,
        });

        const shelfWorks: ShelfWorkEntry[] = sortByPopular(
          workCards,
          shelfPopularityMap
        )
          .slice(0, 5)
          .map((work) => ({
            work,
            metrics:
              shelfPopularityMap.get(work.seriesId) ??
              createEmptyPopularityMetrics(work.seriesId),
          }));

        return {
          ...config,
          works: shelfWorks,
          href: buildSearchHref({
            selectedGenres: selectedGenreLabels,
            selectedTags: selectedTagLabels,
            order: config.order,
            start: config.start,
            end: config.end,
            shelfTab: "overall-popular",
            showTags: showAllTags,
            showGenres: showAllGenres,
          }),
        };
      })
    : [];

  const latestGenreSections =
    isLatestShelfTab && availableGenres.length > 0
      ? buildGenreShelfSections({
          genres: availableGenres,
          works: workCards,
          order: "updated",
          descriptionBuilder: (genre) =>
            `公開中の ${genre.label} 作品を更新順で表示。`,
          badgeLabel: "更新順",
          hrefBuilder: (genre) =>
            buildSearchHref({
              selectedGenres: [genre.label],
              selectedTags: selectedTagLabels,
              order: "updated",
              start: defaultStartInput,
              end: defaultEndInput,
              shelfTab: "latest",
              showTags: showAllTags,
              showGenres: showAllGenres,
            }),
          emptyMessageBuilder: (genre) =>
            `${genre.label} の公開作品はまだない。`,
        })
      : [];

  const latestPlaceholderSections =
    isLatestShelfTab && latestGenreSections.length === 0
      ? buildGenrePlaceholderSections(
          genreCandidateSource,
          "genre 実データがまだ無いため、ここは placeholder を表示している。"
        )
      : [];

  const weeklyNewStartAtValue = isWeeklyNewShelfTab
    ? subtractDaysClamped(Date.now(), 7, oldestPublicAtValue)
    : 0;

  const weeklyNewStartInput = isWeeklyNewShelfTab
    ? formatInputDate(weeklyNewStartAtValue)
    : "";

  const weeklyNewWorks = isWeeklyNewShelfTab
    ? workCards.filter((work) => {
        const firstPublicAtValue = getWorkFirstPublicAtValue(work);

        return (
          firstPublicAtValue >= weeklyNewStartAtValue &&
          firstPublicAtValue <= Date.now()
        );
      })
    : [];

  const weeklyNewGenres = isWeeklyNewShelfTab
    ? buildAvailableGenres(weeklyNewWorks)
    : [];

  const weeklyNewGenreSections =
    isWeeklyNewShelfTab && weeklyNewGenres.length > 0
      ? buildGenreShelfSections({
          genres: weeklyNewGenres,
          works: weeklyNewWorks,
          order: "popular",
          descriptionBuilder: (genre) =>
            `直近7日で初公開された ${genre.label} 作品を暫定人気順で表示。`,
          badgeLabel: "暫定人気順",
          hrefBuilder: (genre) =>
            buildSearchHref({
              selectedGenres: [genre.label],
              selectedTags: selectedTagLabels,
              order: "popular",
              start: weeklyNewStartInput,
              end: defaultEndInput,
              shelfTab: "weekly-new",
              showTags: showAllTags,
              showGenres: showAllGenres,
            }),
          emptyMessageBuilder: (genre) =>
            `直近7日で初公開された ${genre.label} 作品はまだない。`,
        })
      : [];

  const weeklyNewPlaceholderSections =
    isWeeklyNewShelfTab && weeklyNewGenreSections.length === 0
      ? buildGenrePlaceholderSections(
          genreCandidateSource,
          "直近7日で初公開された genre 実データがまだ無いため、ここは placeholder を表示している。"
        )
      : [];

  const narrationShelfConfigs: ShelfConfig[] = isNarrationShelfTab
    ? [
        {
          key: "narration-daily",
          title: "日間",
          description: "直近1日で再生された朗読視聴数順で表示。",
          order: "popular",
          start: formatInputDate(
            subtractDaysClamped(Date.now(), 1, oldestPublicAtValue)
          ),
          end: defaultEndInput,
        },
        {
          key: "narration-weekly",
          title: "週間",
          description: "直近7日で再生された朗読視聴数順で表示。",
          order: "popular",
          start: formatInputDate(
            subtractDaysClamped(Date.now(), 7, oldestPublicAtValue)
          ),
          end: defaultEndInput,
        },
        {
          key: "narration-monthly",
          title: "月間",
          description: "直近30日で再生された朗読視聴数順で表示。",
          order: "popular",
          start: formatInputDate(
            subtractDaysClamped(Date.now(), 30, oldestPublicAtValue)
          ),
          end: defaultEndInput,
        },
        {
          key: "narration-quarterly",
          title: "四半期",
          description: "直近90日で再生された朗読視聴数順で表示。",
          order: "popular",
          start: formatInputDate(
            subtractDaysClamped(Date.now(), 90, oldestPublicAtValue)
          ),
          end: defaultEndInput,
        },
        {
          key: "narration-yearly",
          title: "年間",
          description: "直近365日で再生された朗読視聴数順で表示。",
          order: "popular",
          start: formatInputDate(
            subtractDaysClamped(Date.now(), 365, oldestPublicAtValue)
          ),
          end: defaultEndInput,
        },
        {
          key: "narration-all",
          title: "累計",
          description: "全期間の朗読視聴数順で表示。",
          order: "popular",
          start: defaultStartInput,
          end: defaultEndInput,
        },
      ]
    : [];

  const narrationShelves = isNarrationShelfTab
    ? narrationShelfConfigs.map((config) => {
        const startAt = parseTokyoDateStart(config.start) ?? oldestPublicAtValue;
        const endAt = parseTokyoDateEnd(config.end) ?? Date.now();

        const shelfPopularityMap = buildSeriesPopularityMap(popularityDataset, {
          startAtValue: startAt,
          endAtValue: endAt,
        });

        const shelfWorks: ShelfWorkEntry[] = sortByNarrationPopular(
          filterWorksWithNarrationActivity(workCards, shelfPopularityMap),
          shelfPopularityMap
        )
          .slice(0, 5)
          .map((work) => ({
            work,
            metrics:
              shelfPopularityMap.get(work.seriesId) ??
              createEmptyPopularityMetrics(work.seriesId),
          }));

        return {
          ...config,
          works: shelfWorks,
          href: buildSearchHref({
            selectedGenres: selectedGenreLabels,
            selectedTags: selectedTagLabels,
            order: config.order,
            start: config.start,
            end: config.end,
            shelfTab: "narration-popular",
            showTags: showAllTags,
            showGenres: showAllGenres,
          }),
        };
      })
    : [];

  const shelfTabs: Array<{ key: ShelfTabKey; label: string }> = [
    { key: "overall-popular", label: "総合人気順" },
    { key: "latest", label: "新着更新順" },
    { key: "weekly-new", label: "週間新作おすすめ順" },
    { key: "narration-popular", label: "朗読視聴人気順" },
  ];

  return (
    <main className="min-h-screen bg-white text-black">
      <div className="mx-auto w-full max-w-7xl px-4 pb-20 pt-6 sm:px-6 lg:px-8">
        <div className="mb-4 text-sm text-neutral-500">
          <Link href="/" className="hover:text-black">
            TOP
          </Link>
          <span className="mx-2">/</span>
          <span className="text-neutral-700">公開検索</span>
        </div>

        <PublicSearchControls
          query={query}
          selectedTagLabels={selectedTagLabels}
          selectedGenreLabels={selectedGenreLabels}
          savedFilterKey={savedFilter ?? ""}
          order={order}
          selectedStartInput={selectedStartInput}
          selectedEndInput={selectedEndInput}
          defaultStartInput={defaultStartInput}
          defaultEndInput={defaultEndInput}
          showAllTags={showAllTags}
          showAllGenres={showAllGenres}
          shelfTab={shelfTab}
          visibleTagChips={visibleTagChips}
          hasHiddenTags={hasHiddenTags}
          visibleGenreChips={visibleGenreChips}
          hasHiddenGenres={hasHiddenGenres}
        />

        <section id="shelves" className="pt-10 scroll-mt-24">
          <div className="border-b border-black/10 pb-3">
            <p className="text-[11px] tracking-[0.22em] text-neutral-500">
              SEARCH SHELVES
            </p>
            <h2 className="mt-2 text-xl font-bold text-black sm:text-2xl">
              検索棚
            </h2>

            <div className="mt-4 flex flex-wrap gap-2">
              {shelfTabs.map((tab) => {
                const active = tab.key === shelfTab;

                return (
                  <SearchNavButton
                    key={tab.key}
                    href={buildSearchHref({
                      q: query,
                      selectedTags: selectedTagLabels,
                      selectedGenres: selectedGenreLabels,
                      order,
                      start: selectedStartInput,
                      end: selectedEndInput,
                      showTags: showAllTags,
                      showGenres: showAllGenres,
                      shelfTab: tab.key,
                    })}
                    className={[
                      "rounded-full border px-4 py-2 text-sm transition",
                      active
                        ? "border-sky-200 bg-sky-50 text-black"
                        : "border-black/10 bg-white text-neutral-700 hover:bg-neutral-50",
                    ].join(" ")}
                  >
                    {tab.label}
                  </SearchNavButton>
                );
              })}
            </div>

            <p className="mt-3 text-sm leading-7 text-neutral-600">
              現在表示: {getShelfTabLabel(shelfTab)}
            </p>
            <p className="mt-1 text-sm leading-7 text-neutral-500">
              上の棚は作品を見つけるための入口。今の条件に一致した作品一覧は下でまとめて確認できる。
            </p>
          </div>

          {shelfTab === "overall-popular" ? (
            <div className="mt-6 grid gap-6 xl:grid-cols-2">
              {overallShelves.map((shelf) => (
                <section
                  key={shelf.key}
                  className="rounded-[24px] border border-black/10 bg-white p-4 sm:p-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-semibold text-black">{shelf.title}</h3>
                      <p className="mt-2 text-sm leading-7 text-neutral-600">
                        {shelf.description}
                      </p>
                    </div>

                    <SearchNavButton
                      href={shelf.href}
                      scrollTargetId="results"
                      className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm text-neutral-800 transition hover:bg-neutral-50"
                    >
                      もっと見る
                    </SearchNavButton>
                  </div>

                  {shelf.works.length === 0 ? (
                    <div className="mt-4 rounded-[20px] border border-dashed border-black/15 bg-neutral-50 px-4 py-6 text-sm leading-7 text-neutral-600">
                      条件に合う公開作品がない。
                    </div>
                  ) : (
                    <div className="mt-4 grid gap-3">
                      {shelf.works.map((entry) => {
                        const work = entry.work;
                        const metrics = entry.metrics;

                        return (
                          <div
                            key={work.seriesId}
                            className="rounded-[20px] border border-black/10 bg-white p-0"
                          >
                            <div className="border-b border-black/10 px-4 py-3 text-xs text-neutral-500">
                              期間閲覧 {metrics.viewCount} / 期間いいね {metrics.likeCount} /
                              期間ブックマーク {metrics.bookmarkCount} / 人気値{" "}
                              {formatPopularityScore(metrics.popularityScore)}
                            </div>

                            <div className="p-4">
                              <PublicWorkBoardCard
                                title={work.title}
                                workHref={buildWorkHref(work.seriesId)}
                                authorName={work.authorName}
                                authorHref={
                                  work.authorId ? buildAuthorHref(work.authorId) : undefined
                                }
                                latestPostedLabel={work.latestPostedLabel}
                                summary={work.summary}
                                firstReadHref={
                                  work.firstEpisodeNumber
                                    ? buildReadHref(work.seriesId, work.firstEpisodeNumber)
                                    : undefined
                                }
                                tags={work.tags}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              ))}
            </div>
          ) : null}

          {shelfTab === "latest" ? (
            latestGenreSections.length > 0 ? (
              <div className="mt-6 grid gap-6 xl:grid-cols-2">
                {latestGenreSections.map((section) => (
                  <section
                    key={section.key}
                    className="rounded-[24px] border border-black/10 bg-white p-4 sm:p-5"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="text-lg font-semibold text-black">
                          {section.title}
                        </h3>
                        <p className="mt-2 text-sm leading-7 text-neutral-600">
                          {section.description}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-sm text-black">
                          {section.badgeLabel}
                        </span>

                        <SearchNavButton
                          href={section.href}
                          scrollTargetId="results"
                          className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm text-neutral-800 transition hover:bg-neutral-50"
                        >
                          もっと見る
                        </SearchNavButton>
                      </div>
                    </div>

                    {section.works.length === 0 ? (
                      <div className="mt-4 rounded-[20px] border border-dashed border-black/15 bg-neutral-50 px-4 py-6 text-sm leading-7 text-neutral-600">
                        {section.emptyMessage}
                      </div>
                    ) : (
                      <div className="mt-4 grid gap-3">
                        {section.works.map((work) => (
                          <div
                            key={work.seriesId}
                            className="rounded-[20px] border border-black/10 bg-white p-0"
                          >
                            <div className="border-b border-black/10 px-4 py-3 text-xs text-neutral-500">
                              更新 {work.latestPostedLabel} / いいね {work.likeCount} /
                              ブックマーク {work.bookmarkCount}
                            </div>

                            <div className="p-4">
                              <PublicWorkBoardCard
                                title={work.title}
                                workHref={buildWorkHref(work.seriesId)}
                                authorName={work.authorName}
                                authorHref={
                                  work.authorId
                                    ? buildAuthorHref(work.authorId)
                                    : undefined
                                }
                                latestPostedLabel={work.latestPostedLabel}
                                summary={work.summary}
                                firstReadHref={
                                  work.firstEpisodeNumber
                                    ? buildReadHref(
                                        work.seriesId,
                                        work.firstEpisodeNumber
                                      )
                                    : undefined
                                }
                                tags={work.tags}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                ))}
              </div>
            ) : (
              <div className="mt-6 grid gap-6 xl:grid-cols-2">
                {latestPlaceholderSections.map((section) => (
                  <section
                    key={section.key}
                    className="rounded-[24px] border border-black/10 bg-white p-4 sm:p-5"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="text-lg font-semibold text-black">
                          {section.title}
                        </h3>
                        <p className="mt-2 text-sm leading-7 text-neutral-600">
                          {section.description}
                        </p>
                      </div>

                      <span className="rounded-full border border-violet-200 bg-violet-50 px-4 py-2 text-sm text-violet-700">
                        genre データ待ち
                      </span>
                    </div>

                    <div className="mt-4 grid gap-3">
                      {Array.from({ length: 5 }).map((_, index) => (
                        <div
                          key={`${section.key}-slot-${index + 1}`}
                          className="rounded-[20px] border border-dashed border-black/15 bg-neutral-50 px-4 py-6 text-sm text-neutral-500"
                        >
                          作品スロット {index + 1}
                        </div>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            )
          ) : null}

          {shelfTab === "weekly-new" ? (
            weeklyNewGenreSections.length > 0 ? (
              <div className="mt-6 grid gap-6 xl:grid-cols-2">
                {weeklyNewGenreSections.map((section) => (
                  <section
                    key={section.key}
                    className="rounded-[24px] border border-black/10 bg-white p-4 sm:p-5"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="text-lg font-semibold text-black">
                          {section.title}
                        </h3>
                        <p className="mt-2 text-sm leading-7 text-neutral-600">
                          {section.description}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-sm text-black">
                          {section.badgeLabel}
                        </span>

                    <SearchNavButton
                          href={section.href}
                      scrollTargetId="results"
                      className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm text-neutral-800 transition hover:bg-neutral-50"
                    >
                      もっと見る
                    </SearchNavButton>
                      </div>
                    </div>

                    {section.works.length === 0 ? (
                      <div className="mt-4 rounded-[20px] border border-dashed border-black/15 bg-neutral-50 px-4 py-6 text-sm leading-7 text-neutral-600">
                        {section.emptyMessage}
                      </div>
                    ) : (
                      <div className="mt-4 grid gap-3">
                        {section.works.map((work) => (
                          <div
                            key={work.seriesId}
                            className="rounded-[20px] border border-black/10 bg-white p-0"
                          >
                            <div className="border-b border-black/10 px-4 py-3 text-xs text-neutral-500">
                              閲覧 {work.viewCount} / いいね {work.likeCount} /
                              ブックマーク {work.bookmarkCount} / 人気値{" "}
                              {formatPopularityScore(work.provisionalPopularityScore)}
                            </div>

                            <div className="p-4">
                              <PublicWorkBoardCard
                                title={work.title}
                                workHref={buildWorkHref(work.seriesId)}
                                authorName={work.authorName}
                                authorHref={
                                  work.authorId
                                    ? buildAuthorHref(work.authorId)
                                    : undefined
                                }
                                latestPostedLabel={work.latestPostedLabel}
                                summary={work.summary}
                                firstReadHref={
                                  work.firstEpisodeNumber
                                    ? buildReadHref(
                                        work.seriesId,
                                        work.firstEpisodeNumber
                                      )
                                    : undefined
                                }
                                tags={work.tags}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                ))}
              </div>
            ) : (
              <div className="mt-6 grid gap-6 xl:grid-cols-2">
                {weeklyNewPlaceholderSections.map((section) => (
                  <section
                    key={section.key}
                    className="rounded-[24px] border border-black/10 bg-white p-4 sm:p-5"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="text-lg font-semibold text-black">
                          {section.title}
                        </h3>
                        <p className="mt-2 text-sm leading-7 text-neutral-600">
                          {section.description}
                        </p>
                      </div>

                      <span className="rounded-full border border-violet-200 bg-violet-50 px-4 py-2 text-sm text-violet-700">
                        新作データ待ち
                      </span>
                    </div>

                    <div className="mt-4 grid gap-3">
                      {Array.from({ length: 5 }).map((_, index) => (
                        <div
                          key={`${section.key}-slot-${index + 1}`}
                          className="rounded-[20px] border border-dashed border-black/15 bg-neutral-50 px-4 py-6 text-sm text-neutral-500"
                        >
                          作品スロット {index + 1}
                        </div>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            )
          ) : null}

          {shelfTab === "narration-popular" ? (
            <div className="mt-6 grid gap-6 xl:grid-cols-2">
              {narrationShelves.map((shelf) => (
                <section
                  key={shelf.key}
                  className="rounded-[24px] border border-black/10 bg-white p-4 sm:p-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-semibold text-black">{shelf.title}</h3>
                      <p className="mt-2 text-sm leading-7 text-neutral-600">
                        {shelf.description}
                      </p>
                    </div>

                        <SearchNavButton
                          href={shelf.href}
                          scrollTargetId="results"
                          className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm text-neutral-800 transition hover:bg-neutral-50"
                        >
                          もっと見る
                        </SearchNavButton>
                  </div>

                  {shelf.works.length === 0 ? (
                    <div className="mt-4 rounded-[20px] border border-dashed border-black/15 bg-neutral-50 px-4 py-6 text-sm leading-7 text-neutral-600">
                      この期間に朗読再生された公開作品がまだない。
                    </div>
                  ) : (
                    <div className="mt-4 grid gap-3">
                      {shelf.works.map((entry) => {
                        const work = entry.work;
                        const metrics = entry.metrics;

                        return (
                          <div
                            key={work.seriesId}
                            className="rounded-[20px] border border-black/10 bg-white p-0"
                          >
                            <div className="border-b border-black/10 px-4 py-3 text-xs text-neutral-500">
                              期間再生 {metrics.narrationPlayCount} / 期間閲覧 {metrics.viewCount} /
                              累計再生 {work.narrationPlayCount} / いいね {work.likeCount} /
                              ブックマーク {work.bookmarkCount}
                            </div>

                            <div className="p-4">
                              <PublicWorkBoardCard
                                title={work.title}
                                workHref={buildWorkHref(work.seriesId)}
                                authorName={work.authorName}
                                authorHref={
                                  work.authorId ? buildAuthorHref(work.authorId) : undefined
                                }
                                latestPostedLabel={work.latestPostedLabel}
                                summary={work.summary}
                                firstReadHref={
                                  work.firstEpisodeNumber
                                    ? buildReadHref(work.seriesId, work.firstEpisodeNumber)
                                    : undefined
                                }
                                tags={work.tags}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              ))}
            </div>
          ) : null}
        </section>

        <section id="search-ad-slot" className="pt-10">
          <PublicAdSlot
            slotId="search-results-bridge"
            title="広告掲載予定"
            description="検索棚と検索結果一覧のあいだにだけ広告枠を置く。作品カード列や絞り込み操作の近くには寄せず、誤タップを避ける。"
            minHeightClassName="min-h-[120px]"
          />
        </section>

        <section id="results" className="pt-10 scroll-mt-24">
          <div className="flex flex-wrap items-end justify-between gap-4 border-b border-black/10 pb-3">
            <div>
              <h2 className="text-xl font-bold text-black sm:text-2xl">
                {currentResultsHeading}
              </h2>
              <p className="mt-2 text-sm leading-7 text-neutral-600">
                {currentResultsDescription}
              </p>
              <p className="mt-1 text-sm leading-7 text-neutral-500">
                {hasActiveConditions
                  ? "今の条件に一致した作品を一覧で確認できる。条件を少し緩めると見つけやすくなる。"
                  : "まずは気になる棚から見て、必要なら条件を足して絞り込める。"}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-black/10 bg-neutral-50 px-4 py-2 text-sm text-neutral-700">
                {sortedWorks.length}件
              </span>
            </div>
          </div>

          {workCards.length === 0 ? (
            <div className="mt-6 rounded-[24px] border border-dashed border-black/15 bg-neutral-50 px-5 py-8 text-sm leading-8 text-neutral-600">
              まだ公開作品がない。
            </div>
          ) : sortedWorks.length === 0 ? (
            <div className="mt-6 rounded-[24px] border border-dashed border-black/15 bg-neutral-50 px-5 py-8">
              <p className="text-base font-semibold text-black">
                {savedFilterRequiresLogin
                  ? "この保存一覧を見るにはログインが必要"
                  : "条件に合う公開作品がない"}
              </p>
              <p className="mt-3 text-sm leading-8 text-neutral-600">
                {savedFilterRequiresLogin
                  ? "マイページから一覧ボタンを押して来た場合は、ログイン状態を確認してから開き直して。"
                  : "ジャンルやタグを少し減らすか、期間を広げると見つかりやすい。"}
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                {hasCustomPeriod ? (
                  <SearchNavButton
                    href={resetPeriodHref}
                    className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm text-neutral-800 transition hover:bg-neutral-50"
                  >
                    期間を標準に戻す
                  </SearchNavButton>
                ) : null}

                {hasActiveConditions ? (
                  <SearchNavButton
                    href={clearConditionsHref}
                    className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm text-neutral-800 transition hover:bg-neutral-50"
                  >
                    条件をクリア
                  </SearchNavButton>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-2">
              {sortedWorks.map((work) => {
                const metrics =
                  order === "popular"
                    ? selectedPopularityMap?.get(work.seriesId) ??
                      createEmptyPopularityMetrics(work.seriesId)
                    : currentPopularityMap.get(work.seriesId) ??
                      createEmptyPopularityMetrics(work.seriesId);

                const scoreLabel =
                  order === "popular" ? "指定期間人気値" : "人気値";

                return (
                  <div
                    key={work.seriesId}
                    className="rounded-[24px] border border-black/10 bg-white p-0"
                  >
                    <div className="border-b border-black/10 px-4 py-3 text-xs text-neutral-500">
                      {shelfTab === "narration-popular" ? (
                        <>
                          {order === "popular" ? (
                            <>
                              指定期間再生 {metrics.narrationPlayCount} /{" "}
                            </>
                          ) : null}
                          累計再生 {work.narrationPlayCount} / 閲覧 {work.viewCount} /
                          いいね {work.likeCount} / ブックマーク {work.bookmarkCount}
                        </>
                      ) : (
                        <>
                          閲覧 {work.viewCount} / いいね {work.likeCount} /
                          ブックマーク {work.bookmarkCount} / {scoreLabel}{" "}
                          {formatPopularityScore(metrics.popularityScore)}
                        </>
                      )}
                    </div>

                    <div className="p-4">
                      <PublicWorkBoardCard
                        title={work.title}
                        workHref={buildWorkHref(work.seriesId)}
                        authorName={work.authorName}
                        authorHref={work.authorId ? buildAuthorHref(work.authorId) : undefined}
                        latestPostedLabel={work.latestPostedLabel}
                        summary={work.summary}
                        firstReadHref={
                          work.firstEpisodeNumber
                            ? buildReadHref(work.seriesId, work.firstEpisodeNumber)
                            : undefined
                        }
                        tags={work.tags}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <div className="mt-10 flex flex-wrap gap-3">
          <Link
            href="/"
            className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm text-neutral-800 transition hover:bg-neutral-50"
          >
            TOPへ戻る
          </Link>

          <Link
            href="/#latest"
            className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm text-neutral-800 transition hover:bg-neutral-50"
          >
            トップの一覧へ戻る
          </Link>
        </div>
      </div>
    </main>
  );
}