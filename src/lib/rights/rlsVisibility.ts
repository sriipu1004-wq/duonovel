// Pure mirrors of the canonical select RLS on series / episodes / recordings
// (Issue #216, KD-4). Server code that reads those tables through the service
// role, because the per-country RESTRICTIVE policies (D030) hide a restricted
// work's rows from everyone but its author, must apply exactly these
// conditions so the service role never widens what a viewer may see.
//
// Sources (supabase/migrations):
// - series_select_public_or_owner:
//     author_id = auth.uid() or publication_status = 'public'
// - episodes_public_or_owner_select:
//     series.author_id = auth.uid()
//     or (series.publication_status = 'public'
//         and posting_status = 'posted' and is_published = true)
// - recordings_select_public_visible:
//     is_public = true and the recording's episode belongs to its series,
//     the series is public and the episode is posted and published.
//
// The per-country rule itself is NOT mirrored here: callers check the
// visitor's country with regionBlockedApiResponse /
// assertSeriesAvailableInRequestRegion in the same request.

export type SeriesVisibilityRow = {
  id?: unknown;
  author_id?: unknown;
  publication_status?: unknown;
};

export type EpisodeVisibilityRow = {
  id?: unknown;
  series_id?: unknown;
  posting_status?: unknown;
  is_published?: unknown;
};

export type RecordingVisibilityRow = {
  series_id?: unknown;
  episode_id?: unknown;
  is_public?: unknown;
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function sameId(left: unknown, right: unknown): boolean {
  const a = text(left).toLowerCase();
  return a.length > 0 && a === text(right).toLowerCase();
}

export function isSeriesAuthor(
  series: SeriesVisibilityRow | null | undefined,
  viewerId: string | null | undefined
): boolean {
  if (!series || !viewerId) return false;
  return sameId(series.author_id, viewerId);
}

export function isSeriesPublic(series: SeriesVisibilityRow | null | undefined): boolean {
  return !!series && series.publication_status === "public";
}

export function isEpisodePostedAndPublished(
  episode: EpisodeVisibilityRow | null | undefined
): boolean {
  return !!episode && episode.posting_status === "posted" && episode.is_published === true;
}

/** series_select_public_or_owner */
export function canViewerSeeSeries(
  series: SeriesVisibilityRow | null | undefined,
  viewerId: string | null | undefined
): boolean {
  if (!series) return false;
  return isSeriesAuthor(series, viewerId) || isSeriesPublic(series);
}

/** episodes_public_or_owner_select (the episode must belong to the series). */
export function canViewerSeeEpisode(
  series: SeriesVisibilityRow | null | undefined,
  episode: EpisodeVisibilityRow | null | undefined,
  viewerId: string | null | undefined
): boolean {
  if (!series || !episode) return false;
  if (!sameId(episode.series_id, series.id)) return false;
  if (isSeriesAuthor(series, viewerId)) return true;
  return isSeriesPublic(series) && isEpisodePostedAndPublished(episode);
}

/** recordings_select_public_visible (the anonymous / non-author branch). */
export function isRecordingPubliclyVisible(
  recording: RecordingVisibilityRow | null | undefined,
  episode: EpisodeVisibilityRow | null | undefined,
  series: SeriesVisibilityRow | null | undefined
): boolean {
  if (!recording || !episode || !series) return false;
  if (recording.is_public !== true) return false;
  if (!sameId(recording.episode_id, episode.id)) return false;
  if (!sameId(recording.series_id, series.id)) return false;
  if (!sameId(episode.series_id, series.id)) return false;
  return isSeriesPublic(series) && isEpisodePostedAndPublished(episode);
}
