// Proxy-side loader for series_region_restrictions. The proxy cannot use the
// server-only admin client, so it reads the public-select table through the
// Data API with the public (anon/publishable) key and keeps a short in-memory
// copy. A failed read returns null: the proxy then lets the request through
// and the page-level guard (service role, fail closed) decides.

import {
  parseRegionRestrictionRows,
  REGION_RESTRICTION_SELECT,
  type RegionRestrictionMap,
} from "@/lib/rights/regionRestriction";

const TTL_MS = 60_000;
const FETCH_TIMEOUT_MS = 2_000;

let cached: { map: RegionRestrictionMap; expiresAt: number } | null = null;
let inflight: Promise<RegionRestrictionMap | null> | null = null;

async function fetchMap(): Promise<RegionRestrictionMap | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  const startedAt = Date.now();
  try {
    const response = await fetch(
      `${url.replace(/\/$/, "")}/rest/v1/series_region_restrictions?select=${REGION_RESTRICTION_SELECT}`,
      {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
        cache: "no-store",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      }
    );
    if (!response.ok) return null;
    const map = parseRegionRestrictionRows(await response.json());
    cached = { map, expiresAt: startedAt + TTL_MS };
    return map;
  } catch {
    return null;
  }
}

export async function loadRegionRestrictionMapForProxy(
  now: number = Date.now()
): Promise<RegionRestrictionMap | null> {
  if (cached && cached.expiresAt > now) return cached.map;
  if (!inflight) {
    inflight = fetchMap().finally(() => {
      inflight = null;
    });
  }
  return inflight;
}

/** Test hook. */
export function resetRegionRestrictionProxyCache(): void {
  cached = null;
  inflight = null;
}
