import type { MetadataRoute } from "next";
import { getCachedPublicBaseWorkCards } from "@/lib/publicWorks";

const SITE_URL = "https://www.syosetu-libread.com";

function localeUrl(path: string, locale: "ja" | "en" | "ko") {
  const normalizedPath = path === "/" ? "" : path;
  if (locale === "ja") return `${SITE_URL}${normalizedPath || "/"}`;
  return `${SITE_URL}/${locale}${normalizedPath}`;
}

function alternates(path: string) {
  return {
    languages: {
      ja: localeUrl(path, "ja"),
      en: localeUrl(path, "en"),
      ko: localeUrl(path, "ko"),
      "x-default": localeUrl(path, "ja"),
    },
  };
}

function pushLocalizedEntries(
  entries: MetadataRoute.Sitemap,
  path: string,
  options: {
    lastModified?: Date;
    changeFrequency: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
    priority: number;
  }
) {
  for (const locale of ["ja", "en", "ko"] as const) {
    entries.push({
      url: localeUrl(path, locale),
      ...(options.lastModified ? { lastModified: options.lastModified } : {}),
      changeFrequency: options.changeFrequency,
      priority: locale === "ja" ? options.priority : Math.max(0.1, options.priority - 0.05),
      alternates: alternates(path),
    });
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const works = await getCachedPublicBaseWorkCards({ visibility: "general" });
  const entries: MetadataRoute.Sitemap = [];

  pushLocalizedEntries(entries, "/", {
    changeFrequency: "weekly",
    priority: 1,
  });
  pushLocalizedEntries(entries, "/generate", {
    changeFrequency: "monthly",
    priority: 0.8,
  });

  entries.push(
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
    }
  );

  for (const work of works) {
    const lastModified =
      work.latestPostedAtValue > 0
        ? new Date(work.latestPostedAtValue)
        : undefined;

    if (!work.isShortStory) {
      pushLocalizedEntries(entries, `/works/${encodeURIComponent(work.seriesId)}`, {
        lastModified,
        changeFrequency: "weekly",
        priority: 0.7,
      });
    }

    const uniqueEpisodeNumbers = Array.from(
      new Set(work.publicEpisodeNumbers)
    ).sort((a, b) => a - b);

    for (const episodeNumber of uniqueEpisodeNumbers) {
      pushLocalizedEntries(
        entries,
        `/read/${encodeURIComponent(work.seriesId)}/${encodeURIComponent(String(episodeNumber))}`,
        {
          lastModified,
          changeFrequency: "weekly",
          priority: 0.6,
        }
      );
    }
  }

  return entries;
}
