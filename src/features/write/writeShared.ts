export type RecordingPermissionMode = "open" | "closed" | "approval_required";
export type SeriesPublicationStatus = "private" | "public";
export type EpisodePostingStatus = "draft" | "scheduled" | "posted";
export type EpisodeStatusKind =
  | "draft"
  | "scheduled"
  | "scheduled_live"
  | "posted";

export type SeriesRow = Record<string, unknown> & {
  id: string;
  title?: string | null;
  summary?: string | null;
  description?: string | null;
  catch_copy?: string | null;
  author_id?: string | null;
  bgm_title?: string | null;
  bgm_audio_path?: string | null;
  bgm_settings?: unknown;
  bgmTitle?: string | null;
  bgmAudioPath?: string | null;
  bgmSettings?: unknown;
  effect_settings?: unknown;
  effectSettings?: unknown;
  tags?: string[] | string | null;
  tag_list?: string[] | string | null;
  tagList?: string[] | string | null;
  genres?: string[] | string | null;
  genre?: string | null;
  genre_list?: string[] | string | null;
  genreList?: string[] | string | null;
  recording_permission_mode?: RecordingPermissionMode | null;
  reviews_enabled?: boolean | null;
  reviewsEnabled?: boolean | null;
  episode_comments_enabled?: boolean | null;
  episodeCommentsEnabled?: boolean | null;
  publication_status?: SeriesPublicationStatus | null;
  publicationStatus?: SeriesPublicationStatus | null;
};

export type EpisodeRow = Record<string, unknown> & {
  id: string;
  title?: string | null;
  episode_number?: number | null;
  episodeNumber?: number | null;
  is_published?: boolean | null;
  published?: boolean | null;
  body?: string | null;
  content?: string | null;
  text?: string | null;
  novel_text?: string | null;
  body_text?: string | null;
  series_id?: string | null;
  seriesId?: string | null;
  effect_settings?: unknown;
  effectSettings?: unknown;
  posting_status?: EpisodePostingStatus | null;
  postingStatus?: EpisodePostingStatus | null;
  scheduled_for?: string | null;
  scheduledFor?: string | null;
  posted_at?: string | null;
  postedAt?: string | null;
  last_edited_at?: string | null;
  lastEditedAt?: string | null;
};

function parseBooleanFlag(value: unknown, fallback = true): boolean {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }

  return fallback;
}

function parseDateValue(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return null;
}

function parseTextArrayLike(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item).trim())
      .filter((item) => item.length > 0);
  }

  if (typeof value === "string" && value.trim().length > 0) {
    return value
      .split(/[\n,、]/)
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }

  return [];
}

export function pickText(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }

  return "";
}

export function getSeriesTags(series?: SeriesRow | null): string[] {
  if (!series) {
    return [];
  }

  const candidates = [
    series.tags,
    series.tag_list,
    series.tagList,
  ];

  for (const candidate of candidates) {
    const parsed = parseTextArrayLike(candidate);
    if (parsed.length > 0) {
      return parsed;
    }
  }

  return [];
}

export function getSeriesGenres(series?: SeriesRow | null): string[] {
  if (!series) {
    return [];
  }

  const candidates = [
    series.genres,
    series.genre_list,
    series.genreList,
    series.genre,
  ];

  for (const candidate of candidates) {
    const parsed = parseTextArrayLike(candidate);
    if (parsed.length > 0) {
      return parsed;
    }
  }

  return [];
}

export function getSeriesSummary(series: SeriesRow): string {
  return pickText(series.summary, series.description, series.catch_copy);
}

export function getSeriesPublicationStatus(
  series?: SeriesRow | null
): SeriesPublicationStatus {
  const raw = series?.publication_status ?? series?.publicationStatus;

  if (raw === "public") {
    return "public";
  }

  return "private";
}

export function isPublicSeries(series?: SeriesRow | null): boolean {
  return getSeriesPublicationStatus(series) === "public";
}

export function isSeriesReviewVisible(series?: SeriesRow | null): boolean {
  return parseBooleanFlag(
    series?.reviews_enabled ?? series?.reviewsEnabled,
    true
  );
}

export function isSeriesEpisodeCommentVisible(series?: SeriesRow | null): boolean {
  return parseBooleanFlag(
    series?.episode_comments_enabled ?? series?.episodeCommentsEnabled,
    true
  );
}

export function getEpisodeNumber(episode: EpisodeRow): number {
  const rawValue = episode.episode_number ?? episode.episodeNumber;

  if (typeof rawValue === "number" && Number.isFinite(rawValue)) {
    return rawValue;
  }

  if (typeof rawValue === "string") {
    const parsed = Number(rawValue);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return 0;
}

export function getEpisodePublishedValue(
  episode: EpisodeRow
): boolean | null {
  if (typeof episode.is_published === "boolean") {
    return episode.is_published;
  }

  if (typeof episode.published === "boolean") {
    return episode.published;
  }

  const postingStatus = episode.posting_status ?? episode.postingStatus;
  if (postingStatus === "posted") {
    return true;
  }

  if (postingStatus === "draft" || postingStatus === "scheduled") {
    return false;
  }

  return null;
}

export function getEpisodePostingStatus(
  episode: EpisodeRow
): EpisodePostingStatus {
  const raw = episode.posting_status ?? episode.postingStatus;

  if (raw === "draft" || raw === "scheduled" || raw === "posted") {
    return raw;
  }

  const publishedValue = getEpisodePublishedValue(episode);
  return publishedValue ? "posted" : "draft";
}

export function getEpisodeScheduledForDate(
  episode: EpisodeRow
): Date | null {
  return parseDateValue(episode.scheduled_for ?? episode.scheduledFor);
}

export function getEpisodeScheduledForValue(
  episode: EpisodeRow
): string {
  const raw = episode.scheduled_for ?? episode.scheduledFor;
  return typeof raw === "string" ? raw : "";
}

export function getEpisodePostedAtValue(
  episode: EpisodeRow
): string {
  const raw = episode.posted_at ?? episode.postedAt;

  if (typeof raw === "string") {
    return raw;
  }

  if (getEpisodePostingStatus(episode) === "scheduled") {
    return getEpisodeScheduledForValue(episode);
  }

  return "";
}

export function getEpisodeLastEditedAtValue(
  episode: EpisodeRow
): string {
  const raw = episode.last_edited_at ?? episode.lastEditedAt;
  return typeof raw === "string" ? raw : "";
}

export function isEpisodeDraft(episode: EpisodeRow): boolean {
  return getEpisodePostingStatus(episode) === "draft";
}

export function isEpisodeScheduled(episode: EpisodeRow): boolean {
  return getEpisodePostingStatus(episode) === "scheduled";
}

export function isEpisodePosted(episode: EpisodeRow): boolean {
  return getEpisodePostingStatus(episode) === "posted";
}

export function isEpisodePubliclyVisible(
  episode: EpisodeRow,
  now = new Date()
): boolean {
  const status = getEpisodePostingStatus(episode);

  if (status === "posted") {
    return true;
  }

  if (status === "scheduled") {
    const scheduledFor = getEpisodeScheduledForDate(episode);
    return !!scheduledFor && scheduledFor.getTime() <= now.getTime();
  }

  return false;
}

export function getEpisodeStatusKind(
  episode: EpisodeRow,
  now = new Date()
): EpisodeStatusKind {
  const status = getEpisodePostingStatus(episode);

  if (status === "draft") {
    return "draft";
  }

  if (status === "scheduled") {
    return isEpisodePubliclyVisible(episode, now)
      ? "scheduled_live"
      : "scheduled";
  }

  return "posted";
}

export function getEpisodeStatusLabel(
  episode: EpisodeRow,
  now = new Date()
): string {
  const kind = getEpisodeStatusKind(episode, now);

  if (kind === "draft") return "下書き";
  if (kind === "scheduled") return "予約投稿";
  if (kind === "scheduled_live") return "予約到達";
  return "投稿済み";
}

export function isPublishedEpisode(
  episode: EpisodeRow,
  now = new Date()
): boolean {
  return isEpisodePubliclyVisible(episode, now);
}

export function getEpisodeBody(episode: EpisodeRow): string {
  return pickText(
    episode.body,
    episode.content,
    episode.text,
    episode.novel_text,
    episode.body_text
  );
}

export function sortEpisodes(episodes: EpisodeRow[]): EpisodeRow[] {
  return [...episodes].sort((a, b) => {
    const numberDiff = getEpisodeNumber(a) - getEpisodeNumber(b);
    if (numberDiff !== 0) {
      return numberDiff;
    }

    return a.id.localeCompare(b.id);
  });
}