import { notFound } from "next/navigation";
import { requireOwnedSeries } from "@/lib/auth/requireOwnedSeries";
import EffectSettingsForm from "@/features/effects/EffectSettingsForm";
import {
  getEpisodeNumber,
  pickText,
  type EpisodeRow,
} from "@/features/write/writeShared";
import { fetchBgmLibraryTracks } from "@/lib/bgm/bgmLibrary";
import { parseEffectSettingsFromRow } from "@/lib/effects/effectSettings";

type PageProps = {
  params: Promise<{ seriesId: string; episodeId: string }>;
};

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
  const { supabase } = await requireOwnedSeries(
    seriesId,
    `/write/series/${seriesId}/episodes/${episodeId}/effects`
  );

  const episode = await fetchEpisode(seriesId, episodeId, supabase);
  if (!episode) {
    notFound();
  }

  const libraryTracks = await fetchBgmLibraryTracks(supabase);
  const episodeLabel =
    pickText(episode.title) || `第${getEpisodeNumber(episode) || 1}話`;

  return (
    <EffectSettingsForm
      scope="episode"
      tableName="episodes"
      recordId={episodeId}
      seriesId={seriesId}
      title={`${episodeLabel} の演出編集`}
      subtitle="ここでは話単位の演出を保存する。ルビ、色、太字、斜体、挿絵、場面転換BGM cue などを話単位で持てるようにする。"
      backHref={`/write/series/${seriesId}/episodes/${episodeId}`}
      workspaceHref={`/write/series/${seriesId}`}
      initialSettings={parseEffectSettingsFromRow(
        episode.effect_settings,
        episode["effectSettings"]
      )}
      libraryTracks={libraryTracks}
    />
  );
}