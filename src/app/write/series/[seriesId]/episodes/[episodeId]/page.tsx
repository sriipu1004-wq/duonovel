import { notFound } from "next/navigation";
import { requireOwnedSeries } from "@/lib/auth/requireOwnedSeries";
import WriteEpisodeForm from "@/features/write/WriteEpisodeForm";
import PostedEpisodeEditorControls from "@/features/write/PostedEpisodeEditorControls";
import EffectSettingsForm from "@/features/effects/EffectSettingsForm";
import { getEpisodeBody, getEpisodeNumber, pickText, sortEpisodes, type EpisodeRow, type SeriesRow } from "@/features/write/writeShared";
import { parseBgmSettingsFromRow } from "@/lib/bgm/bgmSettings";
import { parseEffectSettingsFromRow } from "@/lib/effects/effectSettings";

type PageProps = { params: Promise<{ seriesId: string; episodeId: string }> };

async function fetchSeries(seriesId: string, supabase: Awaited<ReturnType<typeof requireOwnedSeries>>["supabase"]): Promise<SeriesRow | null> {
  const { data, error } = await supabase.from("series").select("*").eq("id", seriesId).maybeSingle();
  return error || !data ? null : (data as SeriesRow);
}

async function fetchEpisode(seriesId: string, episodeId: string, supabase: Awaited<ReturnType<typeof requireOwnedSeries>>["supabase"]): Promise<EpisodeRow | null> {
  const first = await supabase.from("episodes").select("*").eq("id", episodeId).eq("series_id", seriesId).maybeSingle();
  if (!first.error && first.data) return first.data as EpisodeRow;
  const second = await supabase.from("episodes").select("*").eq("id", episodeId).eq("seriesId", seriesId).maybeSingle();
  if (!second.error && second.data) return second.data as EpisodeRow;
  const fallback = await supabase.from("episodes").select("*").eq("id", episodeId).maybeSingle();
  return fallback.error || !fallback.data ? null : (fallback.data as EpisodeRow);
}

async function fetchEpisodes(seriesId: string, supabase: Awaited<ReturnType<typeof requireOwnedSeries>>["supabase"]): Promise<EpisodeRow[]> {
  const first = await supabase.from("episodes").select("*").eq("series_id", seriesId);
  if (!first.error) return (first.data ?? []) as EpisodeRow[];
  const second = await supabase.from("episodes").select("*").eq("seriesId", seriesId);
  return second.error ? [] : ((second.data ?? []) as EpisodeRow[]);
}

function findPreviousEpisode(episodes: EpisodeRow[], currentEpisodeNumber: number, currentEpisodeId: string): EpisodeRow | null {
  const candidates = sortEpisodes(episodes).filter((candidate) => candidate.id !== currentEpisodeId && getEpisodeNumber(candidate) < currentEpisodeNumber);
  return candidates.length ? candidates[candidates.length - 1] : null;
}

export default async function WriteEpisodeEditPage({ params }: PageProps) {
  const { seriesId, episodeId } = await params;
  const { supabase } = await requireOwnedSeries(seriesId, `/write/series/${seriesId}/episodes/${episodeId}`);
  const [series, episode] = await Promise.all([fetchSeries(seriesId, supabase), fetchEpisode(seriesId, episodeId, supabase)]);
  if (!series || !episode) notFound();
  const label = pickText(episode.title) || `第${getEpisodeNumber(episode) || 1}話`;
  const previousEpisode = findPreviousEpisode(await fetchEpisodes(seriesId, supabase), getEpisodeNumber(episode) || 1, episode.id);

  return <><PostedEpisodeEditorControls /><WriteEpisodeForm mode="edit" seriesId={seriesId} episode={episode} initialEpisodeNumber={getEpisodeNumber(episode) || 1} previousEpisode={previousEpisode} effectSettingsPanel={<EffectSettingsForm scope="episode" tableName="episodes" recordId={episodeId} seriesId={seriesId} title={`${label} の演出編集`} subtitle="" backHref={`/write/series/${seriesId}/episodes/${episodeId}`} workspaceHref={`/write/series/${seriesId}`} initialSettings={parseEffectSettingsFromRow(episode.effect_settings, episode["effectSettings"])} inheritedSettings={parseEffectSettingsFromRow(series.effect_settings, series["effectSettings"])} previewText={getEpisodeBody(episode)} previewTextLabel={`${label} の本文`} libraryTracks={[]} initialBgmTitle={pickText(episode.bgm_title, episode["bgmTitle"])} initialBgmAudioPath={pickText(episode.bgm_audio_path, episode["bgmAudioPath"])} initialBgmSettings={parseBgmSettingsFromRow(episode.bgm_settings, episode["bgmSettings"])} embedded={true} />} /></>;
}
