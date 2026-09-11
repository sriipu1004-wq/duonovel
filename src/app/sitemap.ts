import type { MetadataRoute } from "next";
import { getCachedPublicBaseWorkCards } from "@/lib/publicWorks";

const SITE_URL = "https://www.syosetu-libread.com";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const works = await getCachedPublicBaseWorkCards({ visibility: "general" });

  const dynamicEntries: MetadataRoute.Sitemap = [];

  for (const work of works) {
    const lastModified =
      work.latestPostedAtValue > 0
        ? new Date(work.latestPostedAtValue)
        : undefined;

    const lastModifiedField = lastModified ? { lastModified } : {};

    // AI短編は /works/[seriesId] から公開readへredirectされるため、
    // sitemapにはredirect元を入れない。
    if (!work.isShortStory) {
      const encodedSeriesId = encodeURIComponent(work.seriesId);
      dynamicEntries.push(
        {
          url: SITE_URL + "/works/" + encodedSeriesId,
          ...lastModifiedField,
          changeFrequency: "weekly",
          priority: 0.7,
        },
        {
          url: SITE_URL + "/en/works/" + encodedSeriesId,
          ...lastModifiedField,
          changeFrequency: "weekly",
          priority: 0.65,
        },
        {
          url: SITE_URL + "/ko/works/" + encodedSeriesId,
          ...lastModifiedField,
          changeFrequency: "weekly",
          priority: 0.65,
        }
      );
    }

    const uniqueEpisodeNumbers = Array.from(
      new Set(work.publicEpisodeNumbers)
    ).sort((a, b) => a - b);

    for (const episodeNumber of uniqueEpisodeNumbers) {
      dynamicEntries.push({
        url:
          SITE_URL +
          "/read/" +
          encodeURIComponent(work.seriesId) +
          "/" +
          encodeURIComponent(String(episodeNumber)),
        ...lastModifiedField,
        changeFrequency: "weekly",
        priority: 0.6,
      });
    }
  }

  return [
    {
      url: SITE_URL + "/",
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: SITE_URL + "/en",
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: SITE_URL + "/ko",
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: SITE_URL + "/generate",
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: SITE_URL + "/en/generate",
      changeFrequency: "monthly",
      priority: 0.75,
    },
    {
      url: SITE_URL + "/ko/generate",
      changeFrequency: "monthly",
      priority: 0.75,
    },
    {
      url: SITE_URL + "/english-novel-reader",
      changeFrequency: "monthly",
      priority: 0.85,
    },
    {
      url: SITE_URL + "/web-novel-language-learning",
      changeFrequency: "monthly",
      priority: 0.9,
    },
    {
      url: SITE_URL + "/pdf-bilingual-reader",
      changeFrequency: "monthly",
      priority: 0.85,
    },
    ...dynamicEntries,
  ];
}
