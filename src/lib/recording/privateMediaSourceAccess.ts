import "server-only";
import {
  getSeriesPublicationStatus,
  isEpisodePubliclyVisible,
  pickText,
  type EpisodeRow,
  type SeriesRow,
} from "@/features/write/writeShared";
import { isR18Series } from "@/lib/contentRating";
import { getCurrentR18ViewerPreference } from "@/lib/contentRatingServer";
import type { ReaderSourceSnapshot } from "@/lib/recording/privateMediaAccess";
import { createAdminClient } from "@/lib/supabase/admin";

export type PrivateMediaSourceContext = {
  snapshot: ReaderSourceSnapshot;
  series: SeriesRow;
  viewerUserId: string | null;
};

/**
 * Fresh server-side reads of the series, episode and current viewer, using
 * the same predicates as the Reader (getSeriesPublicationStatus,
 * isEpisodePubliclyVisible, series owner, isR18Series + showR18Content).
 * Returns null when any read fails (callers answer 404).
 */
export async function loadPrivateMediaSourceContext(
  admin: ReturnType<typeof createAdminClient>,
  seriesId: string,
  episodeId: string
): Promise<PrivateMediaSourceContext | null> {
  const [seriesResult, episodeResult, viewer] = await Promise.all([
    admin.from("series").select("*").eq("id", seriesId).maybeSingle(),
    admin.from("episodes").select("*").eq("id", episodeId).maybeSingle(),
    getCurrentR18ViewerPreference(),
  ]);
  if (
    seriesResult.error ||
    episodeResult.error ||
    !seriesResult.data ||
    !episodeResult.data
  ) {
    return null;
  }
  const series = seriesResult.data as SeriesRow;
  const episode = episodeResult.data as EpisodeRow;
  const ownerId = pickText(series.author_id, series["user_id"], series["userId"]);
  const viewerUserId = viewer.signedIn && viewer.userId ? viewer.userId : null;
  return {
    series,
    viewerUserId,
    snapshot: {
      seriesPublic: getSeriesPublicationStatus(series) === "public",
      episodePublic: isEpisodePubliclyVisible(episode),
      episodeBelongsToSeries:
        pickText(series.id) === seriesId &&
        pickText(episode.series_id, episode["seriesId"]) === seriesId,
      viewerIsSeriesOwner: Boolean(viewerUserId && ownerId && ownerId === viewerUserId),
      isR18: isR18Series(series),
      viewerShowsR18: viewer.showR18Content === true,
    },
  };
}
