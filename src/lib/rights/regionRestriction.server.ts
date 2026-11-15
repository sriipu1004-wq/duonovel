import "server-only";

import { unstable_cache } from "next/cache";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  isSeriesBlockedInCountry,
  normalizeCountryCode,
  parseRegionRestrictionRows,
  regionBlockedMessage,
  REGION_BLOCKED_STATUS,
  REQUEST_COUNTRY_HEADER,
  REGION_RESTRICTION_SELECT,
  type RegionPolicy,
  type RegionRestrictionMap,
} from "@/lib/rights/regionRestriction";

export const REGION_RESTRICTIONS_CACHE_TAG = "series-region-restrictions";

// Plain array (not a Map) so the value survives the data cache serialization.
const loadRegionRestrictionRows = unstable_cache(
  async (): Promise<Array<{ seriesId: string; policy: RegionPolicy }>> => {
    const { data, error } = await createAdminClient()
      .from("series_region_restrictions")
      .select(REGION_RESTRICTION_SELECT);
    // Throwing is not cached: a read failure must never become "no restrictions".
    if (error) throw new Error(`region restrictions: ${error.message}`);
    return [...parseRegionRestrictionRows(data ?? []).entries()].map(
      ([seriesId, policy]) => ({ seriesId, policy })
    );
  },
  ["series-region-restrictions-v2"],
  { revalidate: 60, tags: [REGION_RESTRICTIONS_CACHE_TAG] }
);

export async function loadRegionRestrictionMap(): Promise<RegionRestrictionMap> {
  const rows = await loadRegionRestrictionRows();
  return new Map(rows.map((row) => [row.seriesId, row.policy]));
}

export function countryFromHeaders(source: Pick<Headers, "get">): string | null {
  return normalizeCountryCode(source.get(REQUEST_COUNTRY_HEADER));
}

export async function isSeriesRegionBlockedForCountry(
  seriesId: string | null | undefined,
  country: string | null
): Promise<boolean> {
  if (!seriesId) return false;
  return isSeriesBlockedInCountry(await loadRegionRestrictionMap(), seriesId, country);
}

/**
 * Page guard (defense in depth behind the proxy's 451): a restricted work is
 * rendered as not found for a blocked or unknown country.
 */
export async function assertSeriesAvailableInRequestRegion(
  seriesId: string | null | undefined
): Promise<void> {
  const country = countryFromHeaders(await headers());
  if (await isSeriesRegionBlockedForCountry(seriesId, country)) notFound();
}

/** API guard: a 451 JSON response for a blocked or unknown country, else null. */
export async function regionBlockedApiResponse(
  request: Request,
  seriesId: string | null | undefined
): Promise<Response | null> {
  const country = countryFromHeaders(request.headers);
  if (!(await isSeriesRegionBlockedForCountry(seriesId, country))) return null;
  return Response.json(
    { error: "region_restricted", message: regionBlockedMessage("en") },
    {
      status: REGION_BLOCKED_STATUS,
      headers: { "Cache-Control": "private, no-store" },
    }
  );
}
