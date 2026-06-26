import { notFound } from "next/navigation";
import { requireOwnedSeries } from "@/lib/auth/requireOwnedSeries";
import WriteSeriesForm from "@/features/write/WriteSeriesForm";
import { type EpisodeRow, type SeriesRow } from "@/features/write/writeShared";
import styles from "./page.module.css";

type PageProps = {
  params: Promise<{ seriesId: string }>;
};

function readSettings(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object") return value as Record<string, unknown>;
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function isShortStory(series: SeriesRow): boolean {
  const tags = Array.isArray(series.tags)
    ? series.tags.map(String)
    : typeof series.tags === "string"
      ? series.tags.split(/[\n,、]/u)
      : [];
  const settings = readSettings(series.effect_settings ?? series["effectSettings"]);
  return tags.includes("AI生成") || settings?.storyFormat === "short" || settings?.aiGenerated === true || settings?.source === "time_fit_ai_story";
}

async function fetchSeries(
  seriesId: string,
  supabase: Awaited<ReturnType<typeof requireOwnedSeries>>["supabase"]
): Promise<SeriesRow | null> {
  const { data, error } = await supabase.from("series").select("*").eq("id", seriesId).single();
  return error || !data ? null : (data as SeriesRow);
}

async function fetchEpisodes(
  seriesId: string,
  supabase: Awaited<ReturnType<typeof requireOwnedSeries>>["supabase"]
): Promise<EpisodeRow[]> {
  const firstTry = await supabase.from("episodes").select("*").eq("series_id", seriesId);
  if (!firstTry.error) return (firstTry.data ?? []) as EpisodeRow[];
  const secondTry = await supabase.from("episodes").select("*").eq("seriesId", seriesId);
  return secondTry.error ? [] : ((secondTry.data ?? []) as EpisodeRow[]);
}

export default async function WriteSeriesEditPage({ params }: PageProps) {
  const { seriesId } = await params;
  const { supabase, user } = await requireOwnedSeries(seriesId, `/write/series/${seriesId}`);
  const series = await fetchSeries(seriesId, supabase);
  if (!series) notFound();
  const episodes = await fetchEpisodes(seriesId, supabase);
  const shortStoryComplete = isShortStory(series) && episodes.length > 0;

  return (
    <div className={shortStoryComplete ? styles.shortStoryComplete : undefined}>
      <WriteSeriesForm mode="edit" currentUserId={user.id} series={series} episodes={episodes} />
    </div>
  );
}
