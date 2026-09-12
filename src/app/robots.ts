import type { MetadataRoute } from "next";

const SITE_URL = "https://www.syosetu-libread.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Keep private/user-specific surfaces out of crawling, while leaving
        // Next.js assets crawlable so search engines can render public pages.
        disallow: [
          "/api/",
          "/auth/callback",
          "/library",
          "/en/library",
          "/ko/library",
        ],
      },
    ],
    sitemap: SITE_URL + "/sitemap.xml",
  };
}
