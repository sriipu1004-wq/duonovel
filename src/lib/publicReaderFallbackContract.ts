import type { EpisodeRow, SeriesRow } from "@/features/write/writeShared";
import {
  getEpisodePostingStatus,
  getSeriesPublicationStatus,
} from "@/features/write/writeShared";
import { isR18Series } from "@/lib/contentRating";

export const PUBLIC_READER_FALLBACK_SERIES_SELECT = [
  "id",
  "title",
  "description",
  "publication_status",
  "source_language",
  "content_rating",
  "content_warnings",
].join(",");

export const PUBLIC_READER_FALLBACK_EPISODE_SELECT = [
  "id",
  "series_id",
  "episode_number",
  "title",
  "body",
  "posting_status",
  "is_published",
].join(",");

export function isPublicReaderFallbackSeriesEligible(
  series: SeriesRow | null | undefined
): series is SeriesRow {
  return Boolean(
    series &&
      getSeriesPublicationStatus(series) === "public" &&
      !isR18Series(series)
  );
}

export function isPublicReaderFallbackEpisodeEligible(
  episode: EpisodeRow | null | undefined
): episode is EpisodeRow {
  return Boolean(
    episode &&
      getEpisodePostingStatus(episode) === "posted" &&
      episode.is_published === true
  );
}
