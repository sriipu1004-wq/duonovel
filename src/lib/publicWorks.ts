import { unstable_cache } from "next/cache";
import { createPublicServerClient } from "@/lib/supabase/serverPublic";
import {
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

type UserRow = Record<string, unknown> & {
  id: string;
  display_name?: string | null;
  username?: string | null;
  pen_name?: string | null;
  name?: string | null;
};

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
};

function formatDate(value: string | null | undefined): string {
  if (!value) {
    return "日付未設定";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "日付未設定";
  }

  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Tokyo",
  }).format(parsed);
}

function toTimeValue(value: unknown): number {
  if (typeof value !== "string" || value.trim().length === 0) {
    return 0;
  }

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

function getEpisodeSeriesId(episode: EpisodeRow): string {
  const row = episode as Record<string, unknown>;

  return pickText(row["series_id"], row["seriesId"]);
}

async function fetchPublicSeriesRows(): Promise<SeriesRow[]> {
  const supabase = createPublicServerClient();

  const narrow = await supabase
    .from("series")
    .select(PUBLIC_WORK_SERIES_SELECT)
    .order("created_at", { ascending: false })
    .limit(120);

  if (!narrow.error) {
    return ((narrow.data ?? []) as SeriesRow[]).filter(
      (series) => getSeriesPublicationStatus(series) === "public"
    );
  }

  const fallback = await supabase
    .from("series")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(120);

  if (fallback.error) {
    throw new Error(`series の取得に失敗: ${fallback.error.message}`);
  }

  return ((fallback.data ?? []) as SeriesRow[]).filter(
    (series) => getSeriesPublicationStatus(series) === "public"
  );
}

async function fetchEpisodesBySeriesIds(
  seriesIds: string[]
): Promise<Map<string, EpisodeRow[]>> {
  const supabase = createPublicServerClient();

  if (seriesIds.length === 0) {
    return new Map();
  }

  let episodes: EpisodeRow[] = [];

  const firstTry = await supabase
    .from("episodes")
    .select(PUBLIC_WORK_EPISODE_SELECT)
    .in("series_id", seriesIds);

  if (!firstTry.error) {
    episodes = (firstTry.data ?? []) as EpisodeRow[];
  } else {
    const secondTry = await supabase
      .from("episodes")
      .select(PUBLIC_WORK_EPISODE_SELECT)
      .in("seriesId", seriesIds);

    if (!secondTry.error) {
      episodes = (secondTry.data ?? []) as EpisodeRow[];
    } else {
      const fallbackFirstTry = await supabase
        .from("episodes")
        .select("*")
        .in("series_id", seriesIds);

      if (!fallbackFirstTry.error) {
        episodes = (fallbackFirstTry.data ?? []) as EpisodeRow[];
      } else {
        const fallbackSecondTry = await supabase
          .from("episodes")
          .select("*")
          .in("seriesId", seriesIds);

        if (fallbackSecondTry.error) {
          throw new Error(`episodes の取得に失敗: ${fallbackSecondTry.error.message}`);
        }

        episodes = (fallbackSecondTry.data ?? []) as EpisodeRow[];
      }
    }
  }

  const grouped = new Map<string, EpisodeRow[]>();

  for (const episode of episodes) {
    const seriesId = getEpisodeSeriesId(episode);
    if (!seriesId) {
      continue;
    }

    const current = grouped.get(seriesId) ?? [];
    current.push(episode);
    grouped.set(seriesId, current);
  }

  for (const [seriesId, list] of grouped.entries()) {
    grouped.set(
      seriesId,
      sortEpisodes(list.filter((episode) => isEpisodePubliclyVisible(episode)))
    );
  }

  return grouped;
}

async function fetchAuthorMap(authorIds: string[]): Promise<Map<string, UserRow>> {
  const supabase = createPublicServerClient();

  if (authorIds.length === 0) {
    return new Map();
  }

  const narrow = await supabase
    .from("users")
    .select(PUBLIC_WORK_AUTHOR_SELECT)
    .in("id", authorIds);

  if (!narrow.error) {
    return new Map(((narrow.data ?? []) as UserRow[]).map((user) => [user.id, user]));
  }

  const fallback = await supabase
    .from("users")
    .select("*")
    .in("id", authorIds);

  if (fallback.error) {
    return new Map();
  }

  return new Map(((fallback.data ?? []) as UserRow[]).map((user) => [user.id, user]));
}

async function buildPublicBaseWorkCards(): Promise<PublicBaseWorkCard[]> {
  const publicSeries = await fetchPublicSeriesRows();

  if (publicSeries.length === 0) {
    return [];
  }

  const authorIds = Array.from(
    new Set(
      publicSeries
        .map((series) =>
          pickText(series.author_id, series["user_id"], series["userId"])
        )
        .filter((value): value is string => !!value)
    )
  );

  const [authorMap, episodesBySeriesId] = await Promise.all([
    fetchAuthorMap(authorIds),
    fetchEpisodesBySeriesIds(publicSeries.map((series) => series.id)),
  ]);

  return publicSeries
    .map((series) => {
      const publicEpisodes = episodesBySeriesId.get(series.id) ?? [];

      if (publicEpisodes.length === 0) {
        return null;
      }

      const firstEpisode = publicEpisodes[0] ?? null;
      const latestEpisode = publicEpisodes[publicEpisodes.length - 1] ?? null;

      const authorId =
        pickText(series.author_id, series["user_id"], series["userId"]) || null;

      const author = authorId ? authorMap.get(authorId) : null;

      const latestPostedRaw = latestEpisode
        ? getEpisodePostedAtValue(latestEpisode)
        : null;

      const firstPostedRaw = firstEpisode
        ? getEpisodePostedAtValue(firstEpisode)
        : null;

      const latestPostedAtValue = latestPostedRaw
        ? new Date(latestPostedRaw).getTime()
        : 0;

      const firstPostedAtValue = firstPostedRaw
        ? new Date(firstPostedRaw).getTime()
        : 0;

      const createdAtValue = toTimeValue(series["created_at"]);

      return {
        seriesId: series.id,
        title: pickText(series.title) || "無題",
        summary:
          getSeriesSummary(series) || "あらすじはまだ登録されていません。",
        authorName:
          pickText(
            author?.display_name,
            author?.pen_name,
            author?.username,
            author?.name,
            series["author_name"]
          ) || "作者名未設定",
        authorId,
        episodeCount: publicEpisodes.length,
        firstEpisodeNumber: firstEpisode ? getEpisodeNumber(firstEpisode) : null,
        latestPostedLabel: formatDate(latestPostedRaw),
        latestPostedAtValue,
        earliestPublicAtValue:
          firstPostedAtValue > 0 ? firstPostedAtValue : createdAtValue,
        createdAtValue,
        tags: getSeriesTags(series),
        genres: getSeriesGenres(series),
      } satisfies PublicBaseWorkCard;
    })
    .filter((card): card is PublicBaseWorkCard => !!card)
    .sort((a, b) => {
      if (b.latestPostedAtValue !== a.latestPostedAtValue) {
        return b.latestPostedAtValue - a.latestPostedAtValue;
      }

      return b.createdAtValue - a.createdAtValue;
    });
}

const getCachedPublicBaseWorkCardsInternal = unstable_cache(
  buildPublicBaseWorkCards,
  ["public-base-work-cards"],
  {
    revalidate: 60,
  }
);

export async function getCachedPublicBaseWorkCards(): Promise<PublicBaseWorkCard[]> {
  return getCachedPublicBaseWorkCardsInternal();
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
};

export type PublicRecordingAggregate = {
  seriesId: string;
  totalRecordingLikes: number;
  totalRecordingPlays: number;
  totalRecordingCount: number;
};

const PUBLIC_WORK_SERIES_SELECT = `
  id,
  title,
  summary,
  description,
  catch_copy,
  author_id,
  created_at,
  author_name,
  tags,
  tag_list,
  genres,
  genre,
  genre_list,
  publication_status
`;

const PUBLIC_WORK_EPISODE_SELECT = `
  id,
  series_id,
  episode_number,
  posting_status,
  scheduled_for,
  posted_at
`;

const PUBLIC_WORK_AUTHOR_SELECT = `
  id,
  display_name,
  username,
  pen_name,
  name
`;

const PUBLIC_WORK_RECORDING_AGGREGATE_SELECT = `
  id,
  series_id,
  like_count,
  likes_count,
  play_count,
  plays_count,
  is_public
`;

function isPublicRecording(recording: RecordingAggregateRow): boolean {
  if (recording.is_public === false) return false;
  if (recording.public === false) return false;
  return true;
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

async function buildPublicRecordingAggregates(): Promise<PublicRecordingAggregate[]> {
  const supabase = createPublicServerClient();

  let data: RecordingAggregateRow[] = [];

  const narrow = await supabase
    .from("recordings")
    .select(PUBLIC_WORK_RECORDING_AGGREGATE_SELECT);

  if (!narrow.error) {
    data = (narrow.data ?? []) as RecordingAggregateRow[];
  } else {
    const fallback = await supabase.from("recordings").select("*");

    if (fallback.error) {
      throw new Error(`recordings の取得に失敗: ${fallback.error.message}`);
    }

    data = (fallback.data ?? []) as RecordingAggregateRow[];
  }

  const aggregateMap = new Map<
    string,
    {
      totalRecordingLikes: number;
      totalRecordingPlays: number;
      totalRecordingCount: number;
    }
  >();

  for (const rawRecording of (data ?? []) as RecordingAggregateRow[]) {
    if (!isPublicRecording(rawRecording)) {
      continue;
    }

    const seriesId = getRecordingSeriesId(rawRecording);
    if (!seriesId) {
      continue;
    }

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
  buildPublicRecordingAggregates,
  ["public-recording-aggregates"],
  {
    revalidate: 60,
  }
);

export async function getCachedPublicRecordingAggregates(): Promise<
  PublicRecordingAggregate[]
> {
  return getCachedPublicRecordingAggregatesInternal();
}