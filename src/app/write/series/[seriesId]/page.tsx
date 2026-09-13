import { notFound } from "next/navigation";
import { requireOwnedSeries } from "@/lib/auth/requireOwnedSeries";
import { isOfficialAccountEmail } from "@/lib/auth/officialAccount";
import WriteSeriesForm from "@/features/write/WriteSeriesForm";
import ContentRatingWorkspaceBridge from "@/features/write/ContentRatingWorkspaceBridge";
import TranslationPermissionWorkspaceBridge from "@/features/write/TranslationPermissionWorkspaceBridge";
import SourceLanguageWorkspaceBridge from "@/features/write/SourceLanguageWorkspaceBridge";
import SeriesTranslationGlossaryWorkspace, {
  type SeriesTranslationGlossaryEntryRow,
  type SeriesTranslationGlossaryTargetRow,
  type SeriesTranslationProfileRow,
} from "@/features/write/SeriesTranslationGlossaryWorkspace";
import ContinueStoryAction from "@/features/generation/ContinueStoryAction";
import {
  getEpisodeBody,
  type EpisodeRow,
  type SeriesRow,
} from "@/features/write/writeShared";
import {
  getSeriesContentWarningLocks,
  getSeriesContentWarnings,
} from "@/lib/contentRating";
import {
  inferSeriesSourceLanguage,
  readCanonicalSeriesSourceLanguage,
} from "@/lib/translation/seriesSourceLanguage";
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

function isShortStory(series: SeriesRow, episodeCount: number): boolean {
  const settings = readSettings(series.effect_settings ?? series["effectSettings"]);
  if (settings?.storyFormat === "long") return false;
  if (settings?.storyFormat === "short") return true;
  return episodeCount <= 1;
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

async function fetchTranslationGlossaryData(
  seriesId: string,
  sourceLanguage: string,
  supabase: Awaited<ReturnType<typeof requireOwnedSeries>>["supabase"]
) {
  const entriesResult = await supabase
    .from("series_translation_glossary_entries")
    .select("*")
    .eq("series_id", seriesId)
    .eq("source_language", sourceLanguage)
    .order("updated_at", { ascending: false })
    .limit(500);
  const entries = (entriesResult.data ?? []) as SeriesTranslationGlossaryEntryRow[];
  const entryIds = entries.map((entry) => entry.id);
  const targetsResult = entryIds.length
    ? await supabase
        .from("series_translation_glossary_targets")
        .select("*")
        .in("glossary_entry_id", entryIds)
        .order("updated_at", { ascending: false })
        .limit(500)
    : { data: [] };
  const profilesResult = await supabase
    .from("series_translation_profiles")
    .select("*")
    .eq("series_id", seriesId);
  return {
    entries,
    targets: (targetsResult.data ?? []) as SeriesTranslationGlossaryTargetRow[],
    profiles: (profilesResult.data ?? []) as SeriesTranslationProfileRow[],
  };
}

export default async function WriteSeriesEditPage({ params }: PageProps) {
  const { seriesId } = await params;
  const { supabase, user } = await requireOwnedSeries(seriesId, `/write/series/${seriesId}`);
  const series = await fetchSeries(seriesId, supabase);
  if (!series) notFound();

  const episodes = await fetchEpisodes(seriesId, supabase);
  const shortStoryComplete = isShortStory(series, episodes.length) && episodes.length > 0;
  const className = [styles.workspace, shortStoryComplete ? styles.shortStoryComplete : ""].filter(Boolean).join(" ");
  const isAiGenerated = isAiGeneratedSeries(series);
  const translationPermissionMode =
    series.translation_permission_mode === "open"
      ? "open"
      : series.translation_permission_mode === "closed"
        ? "closed"
        : null;
  const canonicalSourceLanguage = readCanonicalSeriesSourceLanguage(series);
  const sourceLanguage = canonicalSourceLanguage ?? inferSeriesSourceLanguage(series, episodes[0] ? getEpisodeBody(episodes[0]) : null);
  const glossaryData = canonicalSourceLanguage
    ? await fetchTranslationGlossaryData(series.id, canonicalSourceLanguage, supabase)
    : null;

  return (
    <div className={className}>
      <WriteSeriesForm mode="edit" currentUserId={user.id} series={series} episodes={episodes} />
      <SourceLanguageWorkspaceBridge seriesId={series.id} initialLanguage={sourceLanguage} confirmed={Boolean(canonicalSourceLanguage)} />
      {canonicalSourceLanguage && glossaryData ? (
        <SeriesTranslationGlossaryWorkspace
          seriesId={series.id}
          currentUserId={user.id}
          sourceLanguage={canonicalSourceLanguage}
          initialEntries={glossaryData.entries}
          initialTargets={glossaryData.targets}
          initialProfiles={glossaryData.profiles}
        />
      ) : null}
      {isAiGenerated && episodes.length > 0 ? (
        <div className="mx-auto w-full max-w-5xl px-4 pb-6 sm:px-6">
          <ContinueStoryAction seriesId={series.id} isShortStory={shortStoryComplete} />
        </div>
      ) : null}
      <TranslationPermissionWorkspaceBridge
        seriesId={series.id}
        initialMode={translationPermissionMode}
        isAiGenerated={isAiGenerated}
        isOfficialAuthor={isOfficialAccountEmail(user.email)}
      />
      <ContentRatingWorkspaceBridge
        seriesId={series.id}
        initialWarnings={getSeriesContentWarnings(series)}
        lockedWarnings={getSeriesContentWarningLocks(series)}
        isAiGenerated={isAiGenerated}
      />
    </div>
  );
}
