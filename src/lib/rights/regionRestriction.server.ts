import "server-only";

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
  type RegionRestrictionMap,
} from "@/lib/rights/regionRestriction";

const TTL_MS = 60_000;
let cached: { map: RegionRestrictionMap; expiresAt: number } | null = null;
let inflight: Promise<RegionRestrictionMap> | null = null;

const READ_TIMEOUT_MS = 5_000;

async function fetchRegionRestrictionMap(): Promise<RegionRestrictionMap> {
  // Expiry counts from the start of the read, so a slow read never extends
  // the life of the copy; a hung read is aborted (and throws, uncached).
  const startedAt = Date.now();
  const { data, error } = await createAdminClient()
    .from("series_region_restrictions")
    .select(REGION_RESTRICTION_SELECT)
    .abortSignal(AbortSignal.timeout(READ_TIMEOUT_MS));
  // A read failure must never become "no restrictions": throw (not cached).
  if (error) throw new Error(`region restrictions: ${error.message}`);
  const map: RegionRestrictionMap = parseRegionRestrictionRows(data ?? []);
  cached = { map, expiresAt: startedAt + TTL_MS };
  return map;
}

/**
 * In-process copy with a hard 60 s expiry. Unlike a stale-while-revalidate
 * data cache, an expired copy is never served: the next caller waits for a
 * fresh read. So a restriction written N >= 60 s ago is always in effect.
 */
export async function loadRegionRestrictionMap(): Promise<RegionRestrictionMap> {
  if (cached && cached.expiresAt > Date.now()) return cached.map;
  if (!inflight) {
    inflight = fetchRegionRestrictionMap().finally(() => {
      inflight = null;
    });
  }
  return inflight;
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
