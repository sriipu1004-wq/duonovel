import { redirect } from "next/navigation";
import { requireOwnedSeries } from "@/lib/auth/requireOwnedSeries";
import WriteEpisodeForm from "@/features/write/WriteEpisodeForm";
import { getEpisodeNumber, sortEpisodes, type EpisodePostingStatus, type EpisodeRow } from "@/features/write/writeShared";

type PageProps = {
  params: Promise<{ seriesId: string }>;
  searchParams?: Promise<{ initialPostingStatus?: string; initialScheduledFor?: string }>;
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

function isShortStory(series: Record<string, unknown>): boolean {
  const rawTags = series.tags;
  const tags = Array.isArray(rawTags) ? rawTags.map(String) : typeof rawTags === "string" ? rawTags.split(/[\n,、]/u) : [];
  const settings = readSettings(series.effect_settings ?? series.effectSettings);
  return tags.includes("AI生成") || settings?.storyFormat === "short" || settings?.aiGenerated === true || settings?.source === "time_fit_ai_story";
}

async function fetchEpisodes(seriesId: string, supabase: Awaited<ReturnType<typeof requireOwnedSeries>>["supabase"]): Promise<EpisodeRow[]> {
  const firstTry = await supabase.from("episodes").select("*").eq("series_id", seriesId);
  if (!firstTry.error) return (firstTry.data ?? []) as EpisodeRow[];
  const secondTry = await supabase.from("episodes").select("*").eq("seriesId", seriesId);
  return secondTry.error ? [] : ((secondTry.data ?? []) as EpisodeRow[]);
}

function resolveInitialPostingStatus(value?: string): EpisodePostingStatus {
  return value === "posted" || value === "scheduled" || value === "draft" ? value : "draft";
}

function findPreviousEpisode(episodes: EpisodeRow[], currentEpisodeNumber: number): EpisodeRow | null {
  const candidates = sortEpisodes(episodes).filter((episode) => getEpisodeNumber(episode) < currentEpisodeNumber);
  return candidates.length > 0 ? candidates[candidates.length - 1] : null;
}

export default async function WriteEpisodeNewPage({ params, searchParams }: PageProps) {
  const { seriesId } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const { supabase } = await requireOwnedSeries(seriesId, `/write/series/${seriesId}/episodes/new`);
  const [{ data: series }, episodes] = await Promise.all([
    supabase.from("series").select("*").eq("id", seriesId).single(),
    fetchEpisodes(seriesId, supabase),
  ]);
  if (series && isShortStory(series as Record<string, unknown>) && episodes.length > 0) {
    redirect(`/write/series/${seriesId}`);
  }
  const nextEpisodeNumber = episodes.length > 0 ? Math.max(...episodes.map((episode) => getEpisodeNumber(episode))) + 1 : 1;
  const previousEpisode = findPreviousEpisode(episodes, nextEpisodeNumber);

  return <WriteEpisodeForm mode="create" seriesId={seriesId} initialEpisodeNumber={nextEpisodeNumber} initialPostingStatus={resolveInitialPostingStatus(resolvedSearchParams?.initialPostingStatus)} initialScheduledFor={resolvedSearchParams?.initialScheduledFor ?? null} previousEpisode={previousEpisode} />;
}
