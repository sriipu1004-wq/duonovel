import { notFound } from "next/navigation";
import { requireOwnedSeries } from "@/lib/auth/requireOwnedSeries";
import { isOperatorUser } from "@/lib/auth/operator";
import EffectSettingsForm from "@/features/effects/EffectSettingsForm";
import {
  getEpisodeBody,
  getEpisodeNumber,
  pickText,
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

  return null;
}

export default async function EpisodeEffectsPage({ params }: PageProps) {
  const { seriesId, episodeId } = await params;
  const { supabase, user } = await requireOwnedSeries(
    seriesId,
    `/write/series/${seriesId}/episodes/${episodeId}/effects`
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

  return (
    <EffectSettingsForm
      scope="episode"
      tableName="episodes"
      recordId={episodeId}
      seriesId={seriesId}
      title={`${episodeLabel} の演出編集`}
      subtitle="ここでは話単位の演出と各話BGMを保存する。本文表示と演出付き本文プレビューを同じ位置で切り替えながら、各話ごとの見え方を確認できるようにする。"
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
    />
  );
}