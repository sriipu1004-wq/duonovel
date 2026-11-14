/**
 * P9 per-work Open Graph image content. Pure functions only.
 *
 * External fonts are not loaded (owner instruction). next/og (Satori) ships
 * only Geist Regular; any glyph it lacks makes @vercel/og download a Noto
 * font from fonts.googleapis.com at render time. To keep that from ever
 * happening, text is drawn only when every character is inside the set the
 * bundled font covers (verified by scripts/test-p9-share-ogp.tsx, which
 * renders the whole set with fetch stubbed and asserts no font request).
 * Anything else (Japanese, Korean, Chinese, emoji, ...) falls back to the
 * common LIB read image. See docs/p9-utm-measurement.md.
 */

/** Characters in Latin-1 / Latin Extended-A that Geist Regular lacks. */
const GEIST_MISSING_CODE_POINTS = new Set([
  0x00ad, 0x0114, 0x0115, 0x012c, 0x012d, 0x0138, 0x013f, 0x0140, 0x0149,
  0x014e, 0x014f, 0x017f,
]);

/** General punctuation / symbols covered by Geist Regular. */
const GEIST_EXTRA_CODE_POINTS = new Set([
  0x2013, 0x2014, 0x2018, 0x2019, 0x201a, 0x201c, 0x201d, 0x201e, 0x2020,
  0x2021, 0x2022, 0x2026, 0x2030, 0x2039, 0x203a, 0x20ac, 0x2122,
]);

export function isOgBundledFontCodePoint(codePoint: number): boolean {
  if (codePoint >= 0x20 && codePoint <= 0x7e) return true;
  if (codePoint >= 0xa0 && codePoint <= 0x17f) {
    return !GEIST_MISSING_CODE_POINTS.has(codePoint);
  }
  return GEIST_EXTRA_CODE_POINTS.has(codePoint);
}

/** Every code point that isOgBundledFontCodePoint accepts (for the test). */
export function listOgBundledFontCodePoints(): number[] {
  const result: number[] = [];
  for (let codePoint = 0x20; codePoint <= 0x2122; codePoint += 1) {
    if (isOgBundledFontCodePoint(codePoint)) result.push(codePoint);
  }
  return result;
}

/** True when the bundled font can draw the whole text without a download. */
export function isOgBundledFontText(text: string): boolean {
  if (!text) return false;
  for (const char of text) {
    const codePoint = char.codePointAt(0);
    if (codePoint === undefined || !isOgBundledFontCodePoint(codePoint)) {
      return false;
    }
  }
  return true;
}

export function truncateOgText(text: string, maxLength: number): string {
  const chars = Array.from(text.trim().replace(/\s+/gu, " "));
  if (chars.length <= maxLength) return chars.join("");
  return `${chars.slice(0, Math.max(1, maxLength - 1)).join("").trimEnd()}…`;
}

export const OG_TITLE_MAX_LENGTH = 90;
export const OG_AUTHOR_MAX_LENGTH = 60;

export type WorkOgImageContent =
  | { kind: "generic"; reason: "not_public" | "r18" | "no_public_episode" | "no_title" | "font_unavailable" }
  | { kind: "work"; title: string; authorName: string | null };

/**
 * Decide what a work's Open Graph image shows. R18, non-public works and
 * works without a public episode always get the common image, whatever the
 * text. The author is the original author for Public Domain works (the
 * caller resolves it with resolvePublicWorkAttribution).
 */
export function resolveWorkOgImageContent(input: {
  isPublic: boolean;
  isR18: boolean;
  hasPublicEpisode: boolean;
  title: string;
  authorName: string | null | undefined;
}): WorkOgImageContent {
  if (!input.isPublic) return { kind: "generic", reason: "not_public" };
  if (input.isR18) return { kind: "generic", reason: "r18" };
  if (!input.hasPublicEpisode) {
    return { kind: "generic", reason: "no_public_episode" };
  }
  const title = truncateOgText(input.title, OG_TITLE_MAX_LENGTH);
  if (!title) return { kind: "generic", reason: "no_title" };
  if (!isOgBundledFontText(title)) {
    return { kind: "generic", reason: "font_unavailable" };
  }
  const author = truncateOgText(input.authorName ?? "", OG_AUTHOR_MAX_LENGTH);
  return {
    kind: "work",
    title,
    // A Latin title with an author name the bundled font cannot draw: show
    // the title only rather than downloading a font.
    authorName: author && isOgBundledFontText(author) ? author : null,
  };
}

/** Relative URL of a work's Open Graph image route. */
export function workOgImagePath(seriesId: string): string {
  return `/works/${encodeURIComponent(seriesId)}/opengraph-image`;
}
