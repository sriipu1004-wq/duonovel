/**
 * Pure sitemap entry builder (no Supabase/Next runtime imports) so the
 * entry rules can be regression-tested directly. Data loading stays in
 * src/app/sitemap.ts.
 */
import type { MetadataRoute } from "next";
import type { PublicBaseWorkCard } from "@/lib/publicWorks";
import type { SitemapEpisodeDates } from "@/lib/sitemap/loadSitemapEpisodeDates";
import { readerCanonicalPath } from "@/lib/seo/publicWorkSeo";

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

function pushEnKoSearchEntries(
  entries: MetadataRoute.Sitemap,
  path: "/japanese-novel-reader" | "/learn-japanese-with-web-novels",
  priority: number
) {
  const languages = {
    en: `${SITE_URL}/en${path}`,
    ko: `${SITE_URL}/ko${path}`,
  };
  entries.push(
    {
      url: languages.en,
      changeFrequency: "monthly",
      priority,
      alternates: { languages },
    },
    {
      url: languages.ko,
      changeFrequency: "monthly",
      priority,
      alternates: { languages },
    }
  );
}

function pushPdfReaderEntries(entries: MetadataRoute.Sitemap) {
  const languages = {
    ja: `${SITE_URL}/pdf-bilingual-reader`,
    en: `${SITE_URL}/en/pdf-epub-bilingual-reader`,
    ko: `${SITE_URL}/ko/pdf-epub-bilingual-reader`,
    "x-default": `${SITE_URL}/pdf-bilingual-reader`,
  };
  entries.push(
    {
      url: languages.ja,
      changeFrequency: "monthly",
      priority: 0.85,
      alternates: { languages },
    },
    {
      url: languages.en,
      changeFrequency: "monthly",
      priority: 0.85,
      alternates: { languages },
    },
    {
      url: languages.ko,
      changeFrequency: "monthly",
      priority: 0.85,
      alternates: { languages },
    }
  );
}

// P9 author landing page: Japanese and English copies only (/ko shows the
// English copy as noindex, so it is not listed).
function pushForAuthorsEntries(entries: MetadataRoute.Sitemap) {
  const languages = {
    ja: `${SITE_URL}/for-authors`,
    en: `${SITE_URL}/en/for-authors`,
    "x-default": `${SITE_URL}/for-authors`,
  };
  entries.push(
    {
      url: languages.ja,
      changeFrequency: "monthly",
      priority: 0.8,
      alternates: { languages },
    },
    {
      url: languages.en,
      changeFrequency: "monthly",
      priority: 0.75,
      alternates: { languages },
    }
  );
}

function toDate(value: number): Date | undefined {
  return value > 0 ? new Date(value) : undefined;
}

export function buildSitemapEntries(
  works: PublicBaseWorkCard[],
  episodeDates: SitemapEpisodeDates = new Map()
): MetadataRoute.Sitemap {
  const entries: MetadataRoute.Sitemap = [];

  pushLocalizedEntries(entries, "/", {
    changeFrequency: "weekly",
    priority: 1,
  });
  pushLocalizedEntries(entries, "/subscription", {
    changeFrequency: "monthly",
    priority: 0.85,
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
    }
  );

  pushEnKoSearchEntries(entries, "/japanese-novel-reader", 0.9);
  pushEnKoSearchEntries(entries, "/learn-japanese-with-web-novels", 0.9);
  pushPdfReaderEntries(entries);
  pushForAuthorsEntries(entries);

  // `works` is the public, non-R18 catalog (visibility: "general"); only its
  // members produce URLs. episodeDates can only refine <lastmod>.
  for (const work of works) {
    const uniqueEpisodeNumbers = Array.from(
      new Set(work.publicEpisodeNumbers)
    ).sort((a, b) => a - b);
    const datesForWork = episodeDates.get(work.seriesId);
    const episodeLastModified = (episodeNumber: number) =>
      datesForWork?.get(episodeNumber) ?? work.latestPostedAtValue;
    const workLastModified = Math.max(
      work.latestPostedAtValue,
      ...uniqueEpisodeNumbers.map(episodeLastModified)
    );

    if (!work.isShortStory) {
      // Work pages keep all three locales with their hreflang set.
      pushLocalizedEntries(entries, `/works/${encodeURIComponent(work.seriesId)}`, {
        lastModified: toDate(workLastModified),
        changeFrequency: "weekly",
        priority: 0.7,
      });
    }

    // Owner decision 2026-11-15 「元のページにまとめる」: list a Reader page
    // only in the locale of its source language (the canonical copy). The
    // /en/read and /ko/read copies of the same body are not listed and declare
    // this URL as canonical, so no hreflang alternates are emitted here.
    for (const episodeNumber of uniqueEpisodeNumbers) {
      const lastModified = toDate(episodeLastModified(episodeNumber));
      entries.push({
        url:
          SITE_URL +
          readerCanonicalPath(work.seriesId, episodeNumber, work.sourceLanguage),
        ...(lastModified ? { lastModified } : {}),
        changeFrequency: "weekly",
        priority: 0.6,
      });
    }
  }

  return entries;
}
