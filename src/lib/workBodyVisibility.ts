import { getSeriesPublicationStatus, type SeriesRow } from "@/features/write/writeShared";
import { getSeriesContentRating } from "@/lib/contentRating";

/**
 * Public Work BODY gate; metadata noindex alone does not restrict page content.
 * A missing, failed or unconfirmed viewer preference must never authorize R18.
 * Caller should only request the viewer preference for a published R18 series,
 * so anonymous general works remain usable during Auth outages.
 */
export function canViewPublicWorkBody(
  series: SeriesRow | null | undefined,
  viewer: { showR18Content: boolean } | null = null
): boolean {
  if (getSeriesPublicationStatus(series) !== "public") return false;
  return getSeriesContentRating(series) !== "r18" || viewer?.showR18Content === true;
}
