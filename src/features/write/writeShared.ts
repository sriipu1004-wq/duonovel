export type RecordingPermissionMode = "open" | "closed" | "approval_required";

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
  recording_permission_mode?: RecordingPermissionMode | null;
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
};

export function pickText(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }

  return "";
}

export function getSeriesSummary(series: SeriesRow): string {
  return pickText(series.summary, series.description, series.catch_copy);
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

export function isPublishedEpisode(episode: EpisodeRow): boolean {
  if (typeof episode.is_published === "boolean") {
    return episode.is_published;
  }

  if (typeof episode.published === "boolean") {
    return episode.published;
  }

  return true;
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