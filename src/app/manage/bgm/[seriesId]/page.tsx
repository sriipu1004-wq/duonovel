import { notFound } from "next/navigation";
import { requireOwnedSeries } from "@/lib/auth/requireOwnedSeries";
import { isOperatorUser } from "@/lib/auth/operator";
import BgmManageForm from "@/features/manage/BgmManageForm";
import { parseBgmSettingsFromRow } from "@/lib/bgm/bgmSettings";
import {
  fetchAllBgmLibraryTracks,
  fetchBgmLibraryFavoriteIds,
  fetchBgmLibraryTracks,
  sortBgmLibraryTracksByFavorites,
  type SimpleSupabaseLike,
} from "@/lib/bgm/bgmLibrary";
import {
  getEpisodeBody,
  type SeriesRow,
  type EpisodeRow,
} from "@/features/write/writeShared";
import { parseEffectSettingsFromRow } from "@/lib/effects/effectSettings";

type PageProps = {
  params: Promise<{ seriesId: string }>;
};

function pickText(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }
  return "";
}

function getEpisodeNumber(episode: EpisodeRow): number {
  const raw = episode.episode_number ?? episode.episodeNumber ?? 0;
  if (typeof raw === "number") return raw;

  const parsed = Number(raw);
  return Number.isNaN(parsed) ? 0 : parsed;
}

async function fetchEpisodesBySeriesId(
  supabase: Awaited<ReturnType<typeof requireOwnedSeries>>["supabase"],
  seriesId: string
): Promise<EpisodeRow[]> {
  const firstTry = await supabase
    .from("episodes")
    .select("*")
    .eq("series_id", seriesId);

  if (!firstTry.error) {
    return (firstTry.data ?? []) as EpisodeRow[];
  }

  const secondTry = await supabase
    .from("episodes")
    .select("*")
    .eq("seriesId", seriesId);

  if (!secondTry.error) {
    return (secondTry.data ?? []) as EpisodeRow[];
  }

  return [];
}

export default async function ManageBgmPage({ params }: PageProps) {
  const { seriesId } = await params;
  const nextPath = `/manage/bgm/${seriesId}`;
  const { supabase, user } = await requireOwnedSeries(seriesId, nextPath);
  const bgmSupabase = supabase as unknown as SimpleSupabaseLike;

  const { data: seriesData, error: seriesError } = await supabase
    .from("series")
    .select("*")
    .eq("id", seriesId)
    .single();

  if (seriesError || !seriesData) {
    notFound();
  }

  const canUsePrivateTracks = isOperatorUser(user.email ?? null);
  const favoriteTrackIds = await fetchBgmLibraryFavoriteIds(
    bgmSupabase,
    user.id
  );
  const rawLibraryTracks = canUsePrivateTracks
    ? await fetchAllBgmLibraryTracks(bgmSupabase)
    : await fetchBgmLibraryTracks(bgmSupabase);
  const libraryTracks = sortBgmLibraryTracksByFavorites(
    rawLibraryTracks,
    favoriteTrackIds
  );

  const series = seriesData as SeriesRow;
  const episodes = await fetchEpisodesBySeriesId(supabase, seriesId);

  const previewEpisodes = episodes
    .slice()
    .sort((a, b) => getEpisodeNumber(a) - getEpisodeNumber(b))
    .map((episode) => ({
      id: episode.id,
      episodeNumber: getEpisodeNumber(episode),
      title:
        pickText(episode.title, episode["episode_title"]) ||
        `第${getEpisodeNumber(episode)}話`,
      body: getEpisodeBody(episode),
    }));

  return (
    <BgmManageForm
      seriesId={seriesId}
      seriesTitle={pickText(series.title) || "無題"}
      initialSeriesBgmTitle={pickText(series.bgm_title, series["bgmTitle"])}
      initialSeriesBgmAudioPath={pickText(
        series.bgm_audio_path,
        series["bgmAudioPath"]
      )}
      initialSeriesBgmSettings={parseBgmSettingsFromRow(
        series.bgm_settings,
        series["bgmSettings"]
      )}
      initialSeriesEffectSettings={parseEffectSettingsFromRow(
        series.effect_settings,
        series["effectSettings"]
      )}
      previewEpisodes={previewEpisodes}
      libraryTracks={libraryTracks}
    />
  );
}