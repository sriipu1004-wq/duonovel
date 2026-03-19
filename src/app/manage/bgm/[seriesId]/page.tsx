import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import BgmManageForm from "@/features/manage/BgmManageForm";

type PageProps = {
  params: Promise<{ seriesId: string }>;
};

type SeriesRow = Record<string, unknown> & {
  id: string;
  title?: string | null;
  bgm_title?: string | null;
  bgm_audio_path?: string | null;
};

type EpisodeRow = Record<string, unknown> & {
  id: string;
  title?: string | null;
  episode_number?: number | null;
  episodeNumber?: number | null;
  bgm_title?: string | null;
  bgm_audio_path?: string | null;
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

async function fetchEpisodesBySeriesId(seriesId: string): Promise<EpisodeRow[]> {
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

  const { data: seriesData, error: seriesError } = await supabase
    .from("series")
    .select("*")
    .eq("id", seriesId)
    .single();

  if (seriesError || !seriesData) {
    notFound();
  }

  const series = seriesData as SeriesRow;
  const episodes = await fetchEpisodesBySeriesId(seriesId);

  const sortedEpisodes = episodes
    .slice()
    .sort((a, b) => getEpisodeNumber(a) - getEpisodeNumber(b))
    .map((episode) => ({
      id: episode.id,
      episodeNumber: getEpisodeNumber(episode),
      title:
        pickText(episode.title, episode["episode_title"]) ||
        `第${getEpisodeNumber(episode)}話`,
      bgmTitle: pickText(episode.bgm_title, episode["bgmTitle"]),
      bgmAudioPath: pickText(episode.bgm_audio_path, episode["bgmAudioPath"]),
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
      episodes={sortedEpisodes}
    />
  );
}