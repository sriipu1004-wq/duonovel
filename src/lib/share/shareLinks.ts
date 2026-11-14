/**
 * P9 share links. Pure functions only (no React, no browser globals), so the
 * regression test can import this module directly.
 *
 * Rules (docs/p9-utm-measurement.md):
 * - Only each service's public share/intent URL is used. No external script
 *   or SDK is loaded.
 * - Every shared URL carries utm_source / utm_medium / utm_campaign=share and
 *   utm_content = the placement (work / reader), so Vercel Web Analytics can
 *   split inbound visits by channel.
 * - Buttons are shown only for public, non-R18 pages.
 */
import { PUBLIC_SITE_URL, stripAuthorSuffixFromTitle } from "@/lib/seo/publicWorkSeo";

export const SHARE_CHANNELS = ["x", "line", "facebook", "copy", "native"] as const;
export type ShareChannel = (typeof SHARE_CHANNELS)[number];

export const SHARE_PLACEMENTS = ["work", "reader"] as const;
export type SharePlacement = (typeof SHARE_PLACEMENTS)[number];

export const SHARE_UTM_CAMPAIGN = "share";

/**
 * utm_source / utm_medium per channel. The three services are "social".
 * Copy-link and the OS share sheet do not tell us the destination, so they
 * get medium "share" and their own source.
 */
export const SHARE_CHANNEL_UTM: Record<
  ShareChannel,
  { source: string; medium: string }
> = {
  x: { source: "x", medium: "social" },
  line: { source: "line", medium: "social" },
  facebook: { source: "facebook", medium: "social" },
  copy: { source: "copy_link", medium: "share" },
  native: { source: "web_share", medium: "share" },
};

/**
 * Absolute URL on the production origin with the channel's UTM parameters.
 * Existing utm_* parameters are replaced; other query parameters are kept.
 * The hash is dropped (it is never meaningful for a shared landing page).
 */
export function buildShareTargetUrl(
  path: string,
  channel: ShareChannel,
  placement: SharePlacement,
  origin: string = PUBLIC_SITE_URL
): string {
  const url = new URL(path, origin);
  for (const key of [...url.searchParams.keys()]) {
    if (key.toLowerCase().startsWith("utm_")) url.searchParams.delete(key);
  }
  const utm = SHARE_CHANNEL_UTM[channel];
  url.searchParams.set("utm_source", utm.source);
  url.searchParams.set("utm_medium", utm.medium);
  url.searchParams.set("utm_campaign", SHARE_UTM_CAMPAIGN);
  url.searchParams.set("utm_content", placement);
  url.hash = "";
  return url.toString();
}

/** Allowed hosts of the intent URLs (asserted by the regression test). */
export const SHARE_INTENT_HOSTS = {
  x: "twitter.com",
  line: "social-plugins.line.me",
  facebook: "www.facebook.com",
} as const;

/**
 * Public share-intent URL of a service. Returns null for copy/native, which
 * are handled in the browser without leaving the page.
 */
export function buildShareIntentUrl(
  channel: ShareChannel,
  input: { url: string; text: string }
): string | null {
  if (channel === "x") {
    const intent = new URL(`https://${SHARE_INTENT_HOSTS.x}/intent/tweet`);
    intent.searchParams.set("text", input.text);
    intent.searchParams.set("url", input.url);
    return intent.toString();
  }
  if (channel === "line") {
    const intent = new URL(`https://${SHARE_INTENT_HOSTS.line}/lineit/share`);
    intent.searchParams.set("url", input.url);
    return intent.toString();
  }
  if (channel === "facebook") {
    const intent = new URL(`https://${SHARE_INTENT_HOSTS.facebook}/sharer/sharer.php`);
    intent.searchParams.set("u", input.url);
    return intent.toString();
  }
  return null;
}

/**
 * Share buttons are shown only when the page itself is public and the work is
 * not R18. Callers pass the already-resolved flags of the page they render.
 */
export function shouldShowShareButtons(input: {
  isPublic: boolean;
  isR18: boolean;
}): boolean {
  return input.isPublic === true && input.isR18 === false;
}

/** Text placed in the X post / native share sheet: 「title」 author | LIB read. */
export function buildShareText(input: {
  title: string;
  authorName?: string | null;
  quote: (title: string) => string;
}): string {
  const author = (input.authorName ?? "").trim();
  // 「修道院の秋・南部修太郎」+ 南部修太郎 -> 「修道院の秋」 南部修太郎
  const title = input.quote(stripAuthorSuffixFromTitle(input.title, author));
  return [title, author, "| LIB read"].filter(Boolean).join(" ");
}
