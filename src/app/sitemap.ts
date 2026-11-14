import type { MetadataRoute } from "next";
import {
  getCachedPublicBaseWorkCards,
  type PublicBaseWorkCard,
} from "@/lib/publicWorks";
import { loadSitemapWorkFallback } from "@/lib/sitemap/loadSitemapWorkFallback";
import { runReadOnlyWithRetry } from "@/lib/reliability/readOnly";
import { loadSitemapEpisodeDatesSafe } from "@/lib/sitemap/loadSitemapEpisodeDates";
import { buildSitemapEntries } from "@/lib/sitemap/buildSitemapEntries";

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

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [works, episodeDates] = await Promise.all([
    loadSitemapWorks(),
    loadSitemapEpisodeDatesSafe(),
  ]);
  return buildSitemapEntries(works, episodeDates);
}
