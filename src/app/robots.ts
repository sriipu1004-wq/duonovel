import type { MetadataRoute } from "next";

const SITE_URL = "https://www.syosetu-libread.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/auth/callback", "/_next/"],
      },
    ],
    sitemap: SITE_URL + "/sitemap.xml",
  };
}
