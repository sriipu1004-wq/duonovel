import { notFound } from "next/navigation";
import { requireOwnedSeries } from "@/lib/auth/requireOwnedSeries";
import EffectSettingsForm from "@/features/effects/EffectSettingsForm";
import { type SeriesRow } from "@/features/write/writeShared";
import { fetchBgmLibraryTracks } from "@/lib/bgm/bgmLibrary";
import { parseEffectSettingsFromRow } from "@/lib/effects/effectSettings";

type PageProps = {
  params: Promise<{ seriesId: string }>;
};

export default async function SeriesEffectsPage({ params }: PageProps) {
  const { seriesId } = await params;
  const { supabase } = await requireOwnedSeries(
    seriesId,
    `/write/series/${seriesId}/effects`
  );

  const { data, error } = await supabase
    .from("series")
    .select("*")
    .eq("id", seriesId)
    .single();

  if (error || !data) {
    notFound();
  }

  const series = data as SeriesRow;
  const libraryTracks = await fetchBgmLibraryTracks(supabase);

  return (
    <EffectSettingsForm
      scope="series"
      tableName="series"
      recordId={seriesId}
      seriesId={seriesId}
      title={`${series.title ?? "無題"} の演出編集`}
      subtitle="ここでは作品共通演出の保存土台を扱う。背景、既定文字演出、作品共通挿絵、場面転換 cue を作品単位で持てるようにする。"
      backHref={`/write/series/${seriesId}`}
      workspaceHref={`/write/series/${seriesId}`}
      initialSettings={parseEffectSettingsFromRow(
        series.effect_settings,
        series["effectSettings"]
      )}
      libraryTracks={libraryTracks}
    />
  );
}