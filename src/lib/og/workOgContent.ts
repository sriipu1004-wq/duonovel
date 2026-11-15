/**
 * P9 per-work Open Graph image content. Pure functions only.
 *
 * External fonts are never loaded (owner instruction). next/og (Satori)
 * ships only Geist Regular; any glyph missing from the fonts it is given
 * makes @vercel/og download a font from fonts.googleapis.com at render time.
 * To keep that from ever happening, text is drawn only when every character
 * is inside a set a bundled font covers:
 *   - "default": Geist Regular (next/og's own font), Latin only;
 *   - "cjk": the Noto Sans JP / KR subset fonts in src/assets/og-fonts
 *     (owner decision 2026-11-15 「入れる (推奨)」), whose exact coverage is
 *     generated into ogFontCoverage.generated.ts by
 *     scripts/og-fonts/build_og_subset_fonts.py.
 * scripts/test-p9-share-ogp.tsx renders both whole sets with fetch stubbed
 * and asserts no network request. Anything else (a kanji outside the subset,
 * Chinese, emoji, ...) falls back to the common LIB read image.
 * See docs/p9-utm-measurement.md.
 */
import { OG_SUBSET_FONT_RANGES } from "./ogFontCoverage.generated";

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

function everyCodePoint(text: string, accept: (codePoint: number) => boolean): boolean {
  if (!text) return false;
  for (const char of text) {
    const codePoint = char.codePointAt(0);
    if (codePoint === undefined || !accept(codePoint)) return false;
  }
  return true;
}

/** True when the bundled font can draw the whole text without a download. */
export function isOgBundledFontText(text: string): boolean {
  return everyCodePoint(text, isOgBundledFontCodePoint);
}

/** True when the Noto Sans JP / KR subset fonts draw this code point. */
export function isOgSubsetFontCodePoint(codePoint: number): boolean {
  let low = 0;
  let high = OG_SUBSET_FONT_RANGES.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const [start, end] = OG_SUBSET_FONT_RANGES[middle];
    if (codePoint < start) high = middle - 1;
    else if (codePoint > end) low = middle + 1;
    else return true;
  }
  return false;
}

/** Every code point the subset fonts draw (for the test). */
export function listOgSubsetFontCodePoints(): number[] {
  const result: number[] = [];
  for (const [start, end] of OG_SUBSET_FONT_RANGES) {
    for (let codePoint = start; codePoint <= end; codePoint += 1) {
      result.push(codePoint);
    }
  }
  return result;
}

/** True when the subset fonts can draw the whole text without a download. */
export function isOgSubsetFontText(text: string): boolean {
  return everyCodePoint(text, isOgSubsetFontCodePoint);
}

const HANGUL_PATTERN = /[ᄀ-ᇿ㄰-㆏가-힯]/u;

/** Korean text prefers the KR subset (Korean-style glyphs for shared Han). */
export function prefersKoreanOgFont(text: string): boolean {
  return HANGUL_PATTERN.test(text);
}

export function truncateOgText(text: string, maxLength: number): string {
  const chars = Array.from(text.trim().replace(/\s+/gu, " "));
  if (chars.length <= maxLength) return chars.join("");
  return `${chars.slice(0, Math.max(1, maxLength - 1)).join("").trimEnd()}…`;
}

export const OG_TITLE_MAX_LENGTH = 90;
export const OG_AUTHOR_MAX_LENGTH = 60;

/** "default" = next/og's Geist only; "cjk" = the bundled Noto JP/KR subsets. */
export type OgFontSet = "default" | "cjk";

export type WorkOgImageContent =
  | { kind: "generic"; reason: "not_public" | "r18" | "no_public_episode" | "no_title" | "font_unavailable" }
  | { kind: "work"; title: string; authorName: string | null; fontSet: OgFontSet };

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
  const author = truncateOgText(input.authorName ?? "", OG_AUTHOR_MAX_LENGTH);

  if (isOgBundledFontText(title)) {
    if (!author || isOgBundledFontText(author)) {
      return { kind: "work", title, authorName: author || null, fontSet: "default" };
    }
    // e.g. "Kokoro" by 夏目漱石: use the subset fonts when they draw both;
    // otherwise keep the title only rather than download a font.
    if (isOgSubsetFontText(title) && isOgSubsetFontText(author)) {
      return { kind: "work", title, authorName: author, fontSet: "cjk" };
    }
    return { kind: "work", title, authorName: null, fontSet: "default" };
  }
  if (!isOgSubsetFontText(title)) {
    return { kind: "generic", reason: "font_unavailable" };
  }
  return {
    kind: "work",
    title,
    authorName: author && isOgSubsetFontText(author) ? author : null,
    fontSet: "cjk",
  };
}

/** Relative URL of a work's Open Graph image route. */
export function workOgImagePath(seriesId: string): string {
  return `/works/${encodeURIComponent(seriesId)}/opengraph-image`;
}
