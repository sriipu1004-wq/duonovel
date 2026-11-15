import type { MetadataRoute } from "next";
import {
  getCachedPublicBaseWorkCards,
  type PublicBaseWorkCard,
} from "@/lib/publicWorks";
import { loadSitemapWorkFallback } from "@/lib/sitemap/loadSitemapWorkFallback";
import { runReadOnlyWithRetry } from "@/lib/reliability/readOnly";
import { loadSitemapEpisodeDatesSafe } from "@/lib/sitemap/loadSitemapEpisodeDates";
import { buildSitemapEntries } from "@/lib/sitemap/buildSitemapEntries";
import {
  isSeriesBlockedInCountry,
  type RegionRestrictionMap,
} from "@/lib/rights/regionRestriction";
import { loadRegionRestrictionMap } from "@/lib/rights/regionRestriction.server";

export const dynamic = "force-dynamic";
export const revalidate = 60;

export async function loadSitemapWorks(
  loadWorks: () => Promise<PublicBaseWorkCard[]> = () =>
    getCachedPublicBaseWorkCards({ visibility: "general" })
): Promise<PublicBaseWorkCard[]> {
  return loadSitemapWorkFallback(() =>
    runReadOnlyWithRetry(loadWorks, {
      operation: "sitemap public works",
      timeoutMs: 2500,
      retries: 0,
    })
  );
}

// Works withheld in the US (Googlebot crawls from there) answer 451 to the
// crawler, so they are left out of the sitemap. A failed restriction read
// keeps every work: listing a URL distributes no text.
export function excludeUsBlockedWorks(
  works: PublicBaseWorkCard[],
  restrictions: RegionRestrictionMap | null
): PublicBaseWorkCard[] {
  if (!restrictions || restrictions.size === 0) return works;
  return works.filter(
    (work) => !isSeriesBlockedInCountry(restrictions, work.seriesId, "US")
  );
}

async function loadRestrictionsForSitemap(): Promise<RegionRestrictionMap | null> {
  try {
    return await loadRegionRestrictionMap();
  } catch {
    return null;
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [works, episodeDates, restrictions] = await Promise.all([
    loadSitemapWorks(),
    loadSitemapEpisodeDatesSafe(),
    loadRestrictionsForSitemap(),
  ]);
  return buildSitemapEntries(excludeUsBlockedWorks(works, restrictions), episodeDates);
}
