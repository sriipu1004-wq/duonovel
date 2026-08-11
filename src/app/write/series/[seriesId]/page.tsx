import { notFound } from "next/navigation";
import { requireOwnedSeries } from "@/lib/auth/requireOwnedSeries";
import { isOfficialAccountEmail } from "@/lib/auth/officialAccount";
import WriteSeriesForm from "@/features/write/WriteSeriesForm";
import ContentRatingWorkspaceBridge from "@/features/write/ContentRatingWorkspaceBridge";
import TranslationPermissionWorkspaceBridge from "@/features/write/TranslationPermissionWorkspaceBridge";
import { type EpisodeRow, type SeriesRow } from "@/features/write/writeShared";
import { getSeriesContentRating } from "@/lib/contentRating";
import styles from "./page.module.css";

type PageProps = { params: Promise<{ seriesId: string }> };

function readSettings(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object") return value as Record<string, unknown>;
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function parseTags(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String).map((tag) => tag.trim()).filter(Boolean);
  if (typeof raw === "string") return raw.split(/[\n,、]/u).map((tag) => tag.trim()).filter(Boolean);
  return [];
}

function isAiGeneratedSeries(series: SeriesRow): boolean {
  const tags = parseTags(series.tags);
  const settings = readSettings(series.effect_settings ?? series["effectSettings"]);

  return (
    tags.includes("AI生成") ||
    settings?.source === "time_fit_ai_story" ||
    settings?.aiGenerated === true ||
    settings?.authorName === "AI生成"
  );
}

function isShortStory(series: SeriesRow): boolean {
  const settings = readSettings(series.effect_settings ?? series["effectSettings"]);
  return (
    isAiGeneratedSeries(series) ||
    settings?.storyFormat === "short"
  );
}

async function fetchSeries(
  seriesId: string,
  supabase: Awaited<ReturnType<typeof requireOwnedSeries>>["supabase"]
): Promise<SeriesRow | null> {
  const { data, error } = await supabase
    .from("series")
    .select("*")
    .eq("id", seriesId)
    .single();
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
  const { supabase, user } = await requireOwnedSeries(
    seriesId,
    `/write/series/${seriesId}`
  );
  const series = await fetchSeries(seriesId, supabase);
  if (!series) notFound();

  const episodes = await fetchEpisodes(seriesId, supabase);
  const shortStoryComplete = isShortStory(series) && episodes.length > 0;
  const className = [
    styles.workspace,
    shortStoryComplete ? styles.shortStoryComplete : "",
  ]
    .filter(Boolean)
    .join(" ");
  const isAiGenerated = isAiGeneratedSeries(series);
  const translationPermissionMode =
    series.translation_permission_mode === "open"
      ? "open"
      : series.translation_permission_mode === "closed"
        ? "closed"
        : null;

  return (
    <div className={className}>
      <WriteSeriesForm
        mode="edit"
        currentUserId={user.id}
        series={series}
        episodes={episodes}
      />
      <TranslationPermissionWorkspaceBridge
        seriesId={series.id}
        initialMode={translationPermissionMode}
        isAiGenerated={isAiGenerated}
        isOfficialAuthor={isOfficialAccountEmail(user.email)}
      />
      <ContentRatingWorkspaceBridge
        seriesId={series.id}
        initialRating={getSeriesContentRating(series)}
        isAiGenerated={isAiGenerated}
      />
    </div>
  );
}
