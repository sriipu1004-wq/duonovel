import { ImageResponse } from "next/og";
import { supabase } from "@/lib/supabaseClient";
import {
  getSeriesPublicationStatus,
  isEpisodePubliclyVisible,
  pickText,
  type EpisodeRow,
  type SeriesRow,
} from "@/features/write/writeShared";
import { isR18Series } from "@/lib/contentRating";
import { readPublicDomainMetadata } from "@/lib/publicDomainMetadata";
import { getNormalAuthorName } from "@/lib/readerAuthorName";
import { runReadOnlyWithRetry } from "@/lib/reliability/readOnly";
import { resolvePublicWorkAttribution, stripAuthorSuffixFromTitle } from "@/lib/seo/publicWorkSeo";
import { isUuid } from "@/lib/uuid";
import {
  resolveWorkOgImageContent,
  type WorkOgImageContent,
} from "@/lib/og/workOgContent";
import {
  DefaultOgImageElement,
  WorkOgImageElement,
} from "@/lib/og/ogImageElements";

export const alt = "LIB read";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

// Short shared cache: a work that becomes private or R18 must stop showing
// its title within minutes. (next/og would otherwise send its own default.)
const OG_CACHE_CONTROL = "public, max-age=300, s-maxage=300, stale-while-revalidate=300";

type Props = {
  params: Promise<{ seriesId: string }>;
};

async function loadWorkOgContent(seriesId: string): Promise<WorkOgImageContent> {
  if (!isUuid(seriesId)) return { kind: "generic", reason: "not_public" };

  // Anonymous client: RLS applies, the same reader as the public Work page.
  // No viewer cookie is involved, so an R18 work is never drawn even when the
  // requester has opted in to R18 content.
  const seriesResult = await runReadOnlyWithRetry(
    async (signal) =>
      await supabase
        .from("series")
        .select("*")
        .eq("id", seriesId)
        .abortSignal(signal)
        .maybeSingle(),
    { operation: "work og series", timeoutMs: 2500, retries: 0 }
  );
  if (seriesResult.error || !seriesResult.data) {
    return { kind: "generic", reason: "not_public" };
  }
  const series = seriesResult.data as SeriesRow;
  const isPublic = getSeriesPublicationStatus(series) === "public";
  const isR18 = isR18Series(series);
  if (!isPublic || isR18) {
    return resolveWorkOgImageContent({
      isPublic,
      isR18,
      hasPublicEpisode: false,
      title: "",
      authorName: null,
    });
  }

  const episodeResult = await runReadOnlyWithRetry(
    async (signal) =>
      await supabase
        .from("episodes")
        .select("id, episode_number, posting_status, is_published")
        .eq("series_id", seriesId)
        .eq("posting_status", "posted")
        .eq("is_published", true)
        .order("episode_number", { ascending: true })
        .limit(1)
        .abortSignal(signal)
        .maybeSingle(),
    { operation: "work og first episode", timeoutMs: 2500, retries: 0 }
  );
  const firstEpisode = episodeResult.error
    ? null
    : (episodeResult.data as EpisodeRow | null);
  const hasPublicEpisode = Boolean(
    firstEpisode && isEpisodePubliclyVisible(firstEpisode)
  );

  const publicDomain = readPublicDomainMetadata(
    series["effect_settings"] ?? series["effectSettings"]
  );
  // Owner decision 2026-11-15 「原作者を作者にする」.
  const attribution = resolvePublicWorkAttribution({
    publicDomainOriginalAuthor: publicDomain?.originalAuthor,
    accountAuthorName: publicDomain ? "" : await getNormalAuthorName(series, ""),
  });
  const rawTitle = pickText(series.title);
  const title = attribution.isPublicDomain
    ? publicDomain?.originalTitle?.trim() ||
      stripAuthorSuffixFromTitle(rawTitle, attribution.authorName)
    : rawTitle;

  return resolveWorkOgImageContent({
    isPublic,
    isR18,
    hasPublicEpisode,
    title,
    authorName: attribution.authorName,
  });
}

export default async function WorkOpenGraphImage({ params }: Props) {
  const { seriesId } = await params;
  let content: WorkOgImageContent;
  try {
    content = await loadWorkOgContent(seriesId);
  } catch {
    content = { kind: "generic", reason: "not_public" };
  }

  return new ImageResponse(
    content.kind === "work" ? (
      <WorkOgImageElement title={content.title} authorName={content.authorName} />
    ) : (
      <DefaultOgImageElement />
    ),
    { ...size, headers: { "cache-control": OG_CACHE_CONTROL } }
  );
}
