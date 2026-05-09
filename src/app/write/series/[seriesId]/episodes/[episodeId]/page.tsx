import { notFound } from "next/navigation";
import { requireOwnedSeries } from "@/lib/auth/requireOwnedSeries";
import { isOperatorUser } from "@/lib/auth/operator";
import WriteEpisodeForm from "@/features/write/WriteEpisodeForm";
import EffectSettingsForm from "@/features/effects/EffectSettingsForm";
import {
  getEpisodeBody,
  getEpisodeNumber,
  pickText,
  sortEpisodes,
  type EpisodeRow,
  type SeriesRow,
} from "@/features/write/writeShared";
import {
  fetchAllBgmLibraryTracks,
  fetchBgmLibraryFavoriteIds,
  fetchBgmLibraryTracks,
  sortBgmLibraryTracksByFavorites,
  type SimpleSupabaseLike,
} from "@/lib/bgm/bgmLibrary";
import { parseBgmSettingsFromRow } from "@/lib/bgm/bgmSettings";
import { parseEffectSettingsFromRow } from "@/lib/effects/effectSettings";

type PageProps = {
  params: Promise<{ seriesId: string; episodeId: string }>;
};

async function fetchSeries(
  seriesId: string,
  supabase: Awaited<ReturnType<typeof requireOwnedSeries>>["supabase"]
): Promise<SeriesRow | null> {
  const { data, error } = await supabase
    .from("series")
    .select("*")
    .eq("id", seriesId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data as SeriesRow;
}

async function fetchEpisode(
  seriesId: string,
  episodeId: string,
  supabase: Awaited<ReturnType<typeof requireOwnedSeries>>["supabase"]
): Promise<EpisodeRow | null> {
  const firstTry = await supabase
    .from("episodes")
    .select("*")
    .eq("id", episodeId)
    .eq("series_id", seriesId)
    .maybeSingle();

  if (!firstTry.error && firstTry.data) {
    return firstTry.data as EpisodeRow;
  }

  const secondTry = await supabase
    .from("episodes")
    .select("*")
    .eq("id", episodeId)
    .eq("seriesId", seriesId)
    .maybeSingle();

  if (!secondTry.error && secondTry.data) {
    return secondTry.data as EpisodeRow;
  }

  const fallback = await supabase.from("episodes").select("*").eq("id", episodeId).maybeSingle();
  if (!fallback.error && fallback.data) {
    return fallback.data as EpisodeRow;
  }

  return null;
}

async function fetchEpisodes(
  seriesId: string,
  supabase: Awaited<ReturnType<typeof requireOwnedSeries>>["supabase"]
): Promise<EpisodeRow[]> {
  const firstTry = await supabase.from("episodes").select("*").eq("series_id", seriesId);
  if (!firstTry.error) {
    return (firstTry.data ?? []) as EpisodeRow[];
  }

  const secondTry = await supabase.from("episodes").select("*").eq("seriesId", seriesId);
  if (!secondTry.error) {
    return (secondTry.data ?? []) as EpisodeRow[];
  }

  return [];
}

function findPreviousEpisode(
  episodes: EpisodeRow[],
  currentEpisodeNumber: number,
  currentEpisodeId: string
): EpisodeRow | null {
  const candidates = sortEpisodes(episodes).filter((candidate) => {
    if (candidate.id === currentEpisodeId) {
      return false;
    }

    return getEpisodeNumber(candidate) < currentEpisodeNumber;
  });

  return candidates.length > 0 ? candidates[candidates.length - 1] : null;
}

export default async function WriteEpisodeEditPage({ params }: PageProps) {
  const { seriesId, episodeId } = await params;
  const { supabase, user } = await requireOwnedSeries(
    seriesId,
    `/write/series/${seriesId}/episodes/${episodeId}`
  );

  const bgmSupabase = supabase as unknown as SimpleSupabaseLike;

  const [series, episode] = await Promise.all([
    fetchSeries(seriesId, supabase),
    fetchEpisode(seriesId, episodeId, supabase),
  ]);

  if (!series || !episode) {
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
  const episodeLabel =
    pickText(episode.title) || `第${getEpisodeNumber(episode) || 1}話`;

  const allEpisodes = await fetchEpisodes(seriesId, supabase);
  const previousEpisode = findPreviousEpisode(
    allEpisodes,
    getEpisodeNumber(episode) || 1,
    episode.id
  );

  return (
    <WriteEpisodeForm
      mode="edit"
      seriesId={seriesId}
      episode={episode}
      initialEpisodeNumber={getEpisodeNumber(episode) || 1}
      previousEpisode={previousEpisode}
      effectSettingsPanel={
        <EffectSettingsForm
          scope="episode"
          tableName="episodes"
          recordId={episodeId}
          seriesId={seriesId}
          title={`${episodeLabel} の演出編集`}
          subtitle=""
          backHref={`/write/series/${seriesId}/episodes/${episodeId}`}
          workspaceHref={`/write/series/${seriesId}`}
          initialSettings={parseEffectSettingsFromRow(
            episode.effect_settings,
            episode["effectSettings"]
          )}
          inheritedSettings={parseEffectSettingsFromRow(
            series.effect_settings,
            series["effectSettings"]
          )}
          previewText={getEpisodeBody(episode)}
          previewTextLabel={`${episodeLabel} の本文`}
          libraryTracks={libraryTracks}
          initialBgmTitle={pickText(episode.bgm_title, episode["bgmTitle"])}
          initialBgmAudioPath={pickText(
            episode.bgm_audio_path,
            episode["bgmAudioPath"]
          )}
          initialBgmSettings={parseBgmSettingsFromRow(
            episode.bgm_settings,
            episode["bgmSettings"]
          )}
          embedded={true}
        />
      }
    />
  );
}