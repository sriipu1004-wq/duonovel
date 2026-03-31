import { notFound } from "next/navigation";
import { requireOwnedSeries } from "@/lib/auth/requireOwnedSeries";
import EffectSettingsForm from "@/features/effects/EffectSettingsForm";
import {
  getEpisodeBody,
  getEpisodeNumber,
  pickText,
  sortEpisodes,
  type EpisodeRow,
  type SeriesRow,
} from "@/features/write/writeShared";
import { fetchBgmLibraryTracks } from "@/lib/bgm/bgmLibrary";
import { parseEffectSettingsFromRow } from "@/lib/effects/effectSettings";

type PageProps = {
  params: Promise<{ seriesId: string }>;
};

const SERIES_EFFECT_PREVIEW_FALLBACK = [
  "まだ本文が無い作品です。",
  "ここでは作品共通演出の見え方を確認できます。",
  "最初の話を書いたあと、この場所に実本文ベースのプレビューが出る。",
].join("\n");

async function fetchSeries(
  seriesId: string,
  supabase: Awaited<ReturnType<typeof requireOwnedSeries>>["supabase"]
): Promise<SeriesRow | null> {
  const { data, error } = await supabase
    .from("series")
    .select("*")
    .eq("id", seriesId)
    .single();

  if (error || !data) {
    return null;
  }

  return data as SeriesRow;
}

async function fetchEpisodes(
  seriesId: string,
  supabase: Awaited<ReturnType<typeof requireOwnedSeries>>["supabase"]
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

export default async function SeriesEffectsPage({ params }: PageProps) {
  const { seriesId } = await params;
  const { supabase } = await requireOwnedSeries(
    seriesId,
    `/write/series/${seriesId}/effects`
  );

  const series = await fetchSeries(seriesId, supabase);
  if (!series) {
    notFound();
  }

  const episodes = sortEpisodes(await fetchEpisodes(seriesId, supabase));
  const previewEpisode =
    [...episodes]
      .reverse()
      .find((episode) => getEpisodeBody(episode).trim().length > 0) ?? null;

  const previewText = previewEpisode
    ? getEpisodeBody(previewEpisode)
    : SERIES_EFFECT_PREVIEW_FALLBACK;

  const previewTextLabel = previewEpisode
    ? `プレビュー元: ${
        pickText(previewEpisode.title) ||
        `第${getEpisodeNumber(previewEpisode) || 1}話`
      }`
    : "本文未作成のため共通プレビュー用サンプル";

  const libraryTracks = await fetchBgmLibraryTracks(supabase);

  return (
    <EffectSettingsForm
      scope="series"
      tableName="series"
      recordId={seriesId}
      seriesId={seriesId}
      title={`${series.title ?? "無題"} の演出編集`}
      subtitle="ここでは作品共通演出の保存と、その場での本文プレビュー確認を扱う。背景、既定文字、作品共通挿絵、場面転換 cue を作品単位で持てるようにする。"
      backHref={`/write/series/${seriesId}`}
      workspaceHref={`/write/series/${seriesId}`}
      initialSettings={parseEffectSettingsFromRow(
        series.effect_settings,
        series["effectSettings"]
      )}
      inheritedSettings={null}
      previewText={previewText}
      previewTextLabel={previewTextLabel}
      libraryTracks={libraryTracks}
    />
  );
}