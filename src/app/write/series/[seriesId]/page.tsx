import { Suspense } from "react";
import { notFound } from "next/navigation";
import { requireOwnedSeries } from "@/lib/auth/requireOwnedSeries";
import { isOfficialAccountEmail } from "@/lib/auth/officialAccount";
import WriteSeriesForm from "@/features/write/WriteSeriesForm";
import ContentRatingWorkspaceBridge from "@/features/write/ContentRatingWorkspaceBridge";
import TranslationPermissionWorkspaceBridge from "@/features/write/TranslationPermissionWorkspaceBridge";
import SourceLanguageWorkspaceBridge from "@/features/write/SourceLanguageWorkspaceBridge";
import SeriesStatusPortal from "@/features/write/SeriesStatusPortal";
import SeriesTranslationGlossaryWorkspace, {
  type SeriesTranslationGlossaryEntryRow,
  type SeriesTranslationGlossaryTargetRow,
  type SeriesTranslationProfileRow,
} from "@/features/write/SeriesTranslationGlossaryWorkspace";
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
import type { SupportedLanguageTag } from "@/lib/translation/languageRegistry";
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
  const result = await supabase.from("episodes").select("*").eq("series_id", seriesId);
  return result.error ? [] : ((result.data ?? []) as EpisodeRow[]);
}

async function fetchTranslationGlossaryData(
  seriesId: string,
  sourceLanguage: string,
  supabase: Awaited<ReturnType<typeof requireOwnedSeries>>["supabase"]
) {
  const entriesPromise = supabase
    .from("series_translation_glossary_entries")
    .select("*")
    .eq("series_id", seriesId)
    .eq("source_language", sourceLanguage)
    .order("updated_at", { ascending: false })
    .limit(500);
  const profilesPromise = supabase
    .from("series_translation_profiles")
    .select("*")
    .eq("series_id", seriesId);
  const entriesResult = await entriesPromise;
  const entries = (entriesResult.data ?? []) as SeriesTranslationGlossaryEntryRow[];
  const entryIds = entries.map((entry) => entry.id);
  const [targetsResult, profilesResult] = await Promise.all([
    entryIds.length
      ? supabase
          .from("series_translation_glossary_targets")
          .select("*")
          .in("glossary_entry_id", entryIds)
          .order("updated_at", { ascending: false })
          .limit(500)
      : Promise.resolve({ data: [] }),
    profilesPromise,
  ]);
  return {
    entries,
    targets: (targetsResult.data ?? []) as SeriesTranslationGlossaryTargetRow[],
    profiles: (profilesResult.data ?? []) as SeriesTranslationProfileRow[],
  };
}

async function DeferredTranslationGlossary({
  glossaryDataPromise,
  seriesId,
  currentUserId,
  sourceLanguage,
}: {
  glossaryDataPromise: ReturnType<typeof fetchTranslationGlossaryData>;
  seriesId: string;
  currentUserId: string;
  sourceLanguage: SupportedLanguageTag;
}) {
  const glossaryData = await glossaryDataPromise;
  return (
    <SeriesTranslationGlossaryWorkspace
      seriesId={seriesId}
      currentUserId={currentUserId}
      sourceLanguage={sourceLanguage}
      initialEntries={glossaryData.entries}
      initialTargets={glossaryData.targets}
      initialProfiles={glossaryData.profiles}
      embedded
    />
  );
}

export default async function WriteSeriesEditPage({ params }: PageProps) {
  const { seriesId } = await params;
  const { supabase, user } = await requireOwnedSeries(seriesId, `/write/series/${seriesId}`);
  const [series, episodes] = await Promise.all([
    fetchSeries(seriesId, supabase),
    fetchEpisodes(seriesId, supabase),
  ]);
  if (!series) notFound();
  const shortStoryComplete = isShortStory(series, episodes.length) && episodes.length > 0;
  const className = [styles.workspace, shortStoryComplete ? styles.shortStoryComplete : ""].filter(Boolean).join(" ");
  const translationPermissionMode =
    series.translation_permission_mode === "open"
      ? "open"
      : series.translation_permission_mode === "closed"
        ? "closed"
        : null;
  const canonicalSourceLanguage = readCanonicalSeriesSourceLanguage(series);
  const sourceLanguage = canonicalSourceLanguage ?? inferSeriesSourceLanguage(series, episodes[0] ? getEpisodeBody(episodes[0]) : null);
  const glossaryDataPromise = canonicalSourceLanguage
    ? fetchTranslationGlossaryData(series.id, canonicalSourceLanguage, supabase)
    : null;

  return (
    <div className={className}>
      <WriteSeriesForm mode="edit" currentUserId={user.id} series={series} episodes={episodes} />
      <SeriesStatusPortal>
        <SourceLanguageWorkspaceBridge
          seriesId={series.id}
          initialLanguage={sourceLanguage}
          confirmed={Boolean(canonicalSourceLanguage)}
          embedded
        />
        {canonicalSourceLanguage && glossaryDataPromise ? (
          <Suspense
            fallback={<div className="mt-4 h-40 rounded-2xl border border-black/10 bg-neutral-50" aria-busy="true" />}
          >
            <DeferredTranslationGlossary
              glossaryDataPromise={glossaryDataPromise}
              seriesId={series.id}
              currentUserId={user.id}
              sourceLanguage={canonicalSourceLanguage}
            />
          </Suspense>
        ) : null}
      </SeriesStatusPortal>
      <TranslationPermissionWorkspaceBridge
        seriesId={series.id}
        initialMode={translationPermissionMode}
        isOfficialAuthor={isOfficialAccountEmail(user.email)}
      />
      <ContentRatingWorkspaceBridge
        seriesId={series.id}
        initialWarnings={getSeriesContentWarnings(series)}
        lockedWarnings={getSeriesContentWarningLocks(series)}
      />
    </div>
  );
}
