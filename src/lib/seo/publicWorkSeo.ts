/**
 * P9 SEO metadata helpers shared by the Work page, the localized Work page,
 * the Reader and the sitemap. Pure functions only: no server/runtime imports,
 * so regression tests can import this module directly.
 *
 * Owner decisions (2026-11-15, button):
 * - 「原作者を作者にする」: for a rights-checked Public Domain work the author is
 *   the original author everywhere (Reader, Work page, metadata, JSON-LD).
 *   The LIB read account that hosts it is shown separately as the publisher
 *   (「掲載」). User-posted works keep their current attribution.
 * - 「元のページにまとめる」: a Reader page is listed in the sitemap only in the
 *   UI locale that matches the episode's source language. The other locale
 *   copies (same body) declare that page as canonical. Work pages keep all
 *   three locales and their hreflang set.
 */
import type { UiLocale } from "@/i18n/config";

export const PUBLIC_SITE_URL = "https://www.syosetu-libread.com";

/** Card-level fallback written by makePublicBaseWorkCard when no summary exists. */
export const JA_WORK_SUMMARY_FALLBACK = "あらすじはまだ登録されていません。";

export type PublicWorkAttribution = {
  /** Name shown and emitted as the author. */
  authorName: string;
  /** The hosting account when an original author is shown (「掲載」), otherwise null. */
  publisherName: string | null;
  /** True only for a rights-checked Public Domain work (publicDomain metadata). */
  isPublicDomain: boolean;
  /**
   * True for a legacy official work whose original author is recorded
   * without a rights check (effect_settings.legacyAttribution). Shown like a
   * Public Domain author, but never treated as Public Domain (no JSON-LD,
   * no rights notice).
   */
  isLegacyAttribution: boolean;
};

/**
 * The original author wins: rights-checked Public Domain first, then the
 * legacy official attribution (owner decision 2026-11-15 「原作者だけ先に表示」).
 * The account name becomes the publisher only in those two cases;
 * user-posted works are unchanged.
 */
export function resolvePublicWorkAttribution(input: {
  publicDomainOriginalAuthor: string | null | undefined;
  legacyOriginalAuthor?: string | null | undefined;
  accountAuthorName: string;
}): PublicWorkAttribution {
  const publicDomain = (input.publicDomainOriginalAuthor ?? "").trim();
  const legacy = publicDomain ? "" : (input.legacyOriginalAuthor ?? "").trim();
  const original = publicDomain || legacy;
  const account = input.accountAuthorName.trim();
  if (original) {
    return {
      authorName: original,
      publisherName: account && account !== original ? account : null,
      isPublicDomain: Boolean(publicDomain),
      isLegacyAttribution: Boolean(legacy),
    };
  }
  return { authorName: account, publisherName: null, isPublicDomain: false, isLegacyAttribution: false };
}

const AUTHOR_SUFFIX_SEPARATORS = ["・", "　", " ", "／", "/", " - ", " — "];

/**
 * Some imported Public Domain titles carry the author as a suffix
 * (「修道院の秋・南部修太郎」). For metadata strings that add the author
 * themselves, drop that suffix so the author is not repeated.
 */
export function stripAuthorSuffixFromTitle(title: string, author: string): string {
  const trimmedTitle = title.trim();
  const trimmedAuthor = author.trim();
  if (!trimmedAuthor) return trimmedTitle;
  for (const separator of AUTHOR_SUFFIX_SEPARATORS) {
    const suffix = `${separator}${trimmedAuthor}`;
    if (trimmedTitle.endsWith(suffix)) {
      const base = trimmedTitle.slice(0, -suffix.length).trim();
      if (base) return base;
    }
  }
  return trimmedTitle;
}

/**
 * Reader <title>: never repeat the work title when the episode title already
 * starts with it (e.g. series「修道院の秋・南部修太郎」+ episode
 * 「修道院の秋・南部修太郎 — Part 1」).
 */
export function buildReaderHeadline(
  seriesTitle: string,
  episodeTitle: string,
  authorName = ""
): string {
  const series = seriesTitle.trim();
  const episode = normalizeEpisodeTitleForSeo(episodeTitle);
  if (!series) return episode;
  if (!episode || episode === series) return series;
  if (readerEpisodeRepeatsWorkTitle(series, episode, authorName)) return episode;
  return `${series} ${episode}`;
}

/**
 * Some imported episode titles repeat the part marker
 * (「The Wind in the Willows — Part 1 — Part 1/4」). Keep the more specific
 * one for metadata strings only; stored titles are not changed.
 */
export function normalizeEpisodeTitleForSeo(episodeTitle: string): string {
  return episodeTitle
    .trim()
    .replace(/\s*[—–-]\s*Part\s+(\d+)\s*[—–-]\s*Part\s+\1\s*\/\s*(\d+)\s*$/u, " — Part $1/$2");
}

/**
 * True when the episode title already carries the work title, either in
 * full or without an author suffix (series「The Wind in the Willows・Kenneth
 * Grahame」+ episode「The Wind in the Willows — Part 1」).
 */
export function readerEpisodeRepeatsWorkTitle(
  seriesTitle: string,
  episodeTitle: string,
  authorName = ""
): boolean {
  const series = seriesTitle.trim();
  const episode = episodeTitle.trim();
  if (!series || !episode) return false;
  if (episode.startsWith(series)) return true;
  const base = stripAuthorSuffixFromTitle(series, authorName);
  return base !== series && episode.startsWith(base);
}

export function buildReaderMetadataTitle(
  seriesTitle: string,
  episodeTitle: string,
  authorName = ""
): string {
  return `${buildReaderHeadline(seriesTitle, episodeTitle, authorName)} | LIB read`;
}

/** True when the card summary is only the Japanese "no synopsis" placeholder. */
export function isWorkSummaryPlaceholder(summary: string | null | undefined): boolean {
  const text = (summary ?? "").trim();
  return text.length === 0 || text === JA_WORK_SUMMARY_FALLBACK;
}

const LANGUAGE_NAMES: Record<UiLocale, Record<string, string>> = {
  ja: { ja: "日本語", en: "英語", ko: "韓国語", "zh-Hans": "中国語（簡体字）", "zh-Hant": "中国語（繁体字）", es: "スペイン語", fr: "フランス語", de: "ドイツ語" },
  en: { ja: "Japanese", en: "English", ko: "Korean", "zh-Hans": "Simplified Chinese", "zh-Hant": "Traditional Chinese", es: "Spanish", fr: "French", de: "German" },
  ko: { ja: "일본어", en: "영어", ko: "한국어", "zh-Hans": "중국어(간체)", "zh-Hant": "중국어(번체)", es: "스페인어", fr: "프랑스어", de: "독일어" },
};

/**
 * Operator works (Public Domain or a recorded original author) carry Japanese
 * synopses (content/synopses). On en/ko pages such a synopsis is dropped so the
 * localized fallback description is used; user works keep their own summary.
 */
export function summaryForLocaleMetadata(
  summary: string | null | undefined,
  locale: string,
  isOperatorWork: boolean
): string {
  const text = (summary ?? "").trim();
  if (locale !== "ja" && isOperatorWork && /[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(text)) {
    return "";
  }
  return text;
}

export function localizedLanguageName(tag: string | null | undefined, locale: UiLocale): string {
  const value = (tag ?? "").trim();
  if (!value) return "";
  return LANGUAGE_NAMES[locale][value] ?? value;
}

type LocalizedWorkCopy = {
  title: (input: { title: string; author: string; isPublicDomain: boolean }) => string;
  fallbackSummary: (input: { title: string; author: string; isPublicDomain: boolean }) => string;
  author: string;
  originalAuthor: string;
  originalLanguage: string;
  source: string;
  publishedBy: string;
};

const LOCALIZED_WORK_COPY: Record<"en" | "ko", LocalizedWorkCopy> = {
  en: {
    title: ({ title, author, isPublicDomain }) =>
      isPublicDomain && author
        ? `${title} by ${author} — Read online | LIB read`
        : `${title} — Read online | LIB read`,
    fallbackSummary: ({ title, author, isPublicDomain }) =>
      isPublicDomain && author
        ? `Read "${title}" by ${author} online for free, with bilingual and translation reading modes.`
        : `Read "${title}" online on LIB read, with bilingual and translation reading modes.`,
    author: "Author",
    originalAuthor: "Original author",
    originalLanguage: "Original language",
    source: "Source",
    publishedBy: "Published on LIB read by",
  },
  ko: {
    title: ({ title, author, isPublicDomain }) =>
      isPublicDomain && author
        ? `${title} - ${author} | 온라인으로 읽기 | LIB read`
        : `${title} | 온라인으로 읽기 | LIB read`,
    fallbackSummary: ({ title, author, isPublicDomain }) =>
      isPublicDomain && author
        ? `${author}의 「${title}」을(를) 무료로 온라인에서 읽을 수 있습니다. 대역·번역 읽기 모드를 지원합니다.`
        : `「${title}」을(를) LIB read에서 온라인으로 읽을 수 있습니다. 대역·번역 읽기 모드를 지원합니다.`,
    author: "작가",
    originalAuthor: "원저자",
    originalLanguage: "원문 언어",
    source: "출처",
    publishedBy: "게재",
  },
};

/** Localized title/description for /en/works/* and /ko/works/*. */
export function buildLocalizedWorkMetadataText(input: {
  locale: "en" | "ko";
  title: string;
  summary: string | null | undefined;
  authorName: string;
  isPublicDomain: boolean;
  /**
   * authorName is a recorded original author without a rights check (legacy
   * official works, owner decision 2026-11-15 「原作者だけ先に表示」). Named
   * like a Public Domain author; the source line stays Public Domain only.
   */
  hasOriginalAuthor?: boolean;
  sourceLanguage: string | null | undefined;
  sourceProvider: string | null | undefined;
}): { title: string; description: string } {
  const copy = LOCALIZED_WORK_COPY[input.locale];
  const author = input.authorName.trim();
  const originalAuthor = input.isPublicDomain || input.hasOriginalAuthor === true;
  const displayTitle = originalAuthor
    ? stripAuthorSuffixFromTitle(input.title, author)
    : input.title.trim();
  const titleInput = { title: displayTitle, author, isPublicDomain: originalAuthor };
  const localSummary = summaryForLocaleMetadata(input.summary, input.locale, originalAuthor);
  const summary = isWorkSummaryPlaceholder(localSummary)
    ? copy.fallbackSummary(titleInput)
    : localSummary;
  const languageName = localizedLanguageName(input.sourceLanguage, input.locale);
  const description = [
    summary,
    author
      ? `${originalAuthor ? copy.originalAuthor : copy.author}: ${author}.`
      : "",
    languageName ? `${copy.originalLanguage}: ${languageName}.` : "",
    input.isPublicDomain && input.sourceProvider
      ? `${copy.source}: ${input.sourceProvider}.`
      : "",
  ]
    .filter(Boolean)
    .join(" ")
    .slice(0, 160);
  return { title: copy.title(titleInput), description };
}

/**
 * The UI locale whose Reader page is canonical for an episode: the locale
 * matching the source language, otherwise the default (Japanese, unprefixed).
 */
export function readerCanonicalLocale(sourceLanguage: string | null | undefined): UiLocale {
  const base = (sourceLanguage ?? "").trim().toLowerCase().split("-")[0];
  if (base === "en") return "en";
  if (base === "ko") return "ko";
  return "ja";
}

export function readerBasePath(seriesId: string, episodeNumber: number): string {
  return `/read/${encodeURIComponent(seriesId)}/${encodeURIComponent(String(episodeNumber))}`;
}

export function localeRelativePath(path: string, locale: UiLocale): string {
  if (locale === "ja") return path || "/";
  return path === "/" ? `/${locale}` : `/${locale}${path}`;
}

/** Relative canonical path for any locale copy of a Reader page. */
export function readerCanonicalPath(
  seriesId: string,
  episodeNumber: number,
  sourceLanguage: string | null | undefined
): string {
  return localeRelativePath(
    readerBasePath(seriesId, episodeNumber),
    readerCanonicalLocale(sourceLanguage)
  );
}

function stripUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined && entry !== null && entry !== "")
  ) as T;
}

/**
 * schema.org JSON-LD for a Reader page.
 *
 * Emitted only for rights-checked Public Domain works, the same rule as the
 * Work page JSON-LD (works/[seriesId]/page.tsx). Returns null otherwise, so an
 * official-account work without Public Domain metadata can never publish
 * "LIB read Official" as a Person author, and user-posted works get no
 * Reader JSON-LD (as on the Work page). Callers must additionally gate on
 * public, non-R18 pages.
 */
export function buildReaderJsonLd(input: {
  seriesId: string;
  seriesTitle: string;
  episodeTitle: string;
  episodeNumber: number;
  sourceLanguage: string | null | undefined;
  attribution: PublicWorkAttribution;
  /** True when no Work page exists for this series (sitemap rule). */
  isShortStory: boolean;
  publicDomainOriginalTitle?: string | null;
  publicDomainSourceUrl?: string | null;
  publicDomainFirstPublicationYear?: number | null;
}): Record<string, unknown> | null {
  if (!input.attribution.isPublicDomain || !input.attribution.authorName) {
    return null;
  }
  const author = { "@type": "Person", name: input.attribution.authorName };
  const publisher = input.attribution.publisherName
    ? { "@type": "Organization", name: input.attribution.publisherName }
    : undefined;
  const workUrl = input.isShortStory
    ? undefined
    : `${PUBLIC_SITE_URL}/works/${encodeURIComponent(input.seriesId)}`;
  const isPartOf = stripUndefined({
    "@type": "CreativeWork",
    name: publicWorkSchemaName(
      input.seriesTitle,
      input.attribution.authorName,
      input.publicDomainOriginalTitle
    ),
    url: workUrl,
    author,
    datePublished: input.publicDomainFirstPublicationYear
      ? String(input.publicDomainFirstPublicationYear)
      : undefined,
  });
  return stripUndefined({
    "@context": "https://schema.org",
    "@type": "Chapter",
    name: buildReaderHeadline(
      input.seriesTitle,
      input.episodeTitle,
      input.attribution.authorName
    ),
    position: input.episodeNumber,
    url:
      PUBLIC_SITE_URL +
      readerCanonicalPath(input.seriesId, input.episodeNumber, input.sourceLanguage),
    inLanguage: input.sourceLanguage || undefined,
    author,
    publisher,
    isPartOf,
    isAccessibleForFree: true,
    isBasedOn: input.publicDomainSourceUrl || undefined,
  });
}

/**
 * Work name for structured data: the verified original title when present,
 * otherwise the display title without an author suffix
 * (「修道院の秋・南部修太郎」 -> 「修道院の秋」), since author is a separate field.
 */
export function publicWorkSchemaName(
  seriesTitle: string,
  authorName: string,
  originalTitle?: string | null
): string {
  const original = (originalTitle ?? "").trim();
  if (original) return original;
  return stripAuthorSuffixFromTitle(seriesTitle, authorName);
}

/** open graph locale of the canonical (source-language) Reader copy. */
export function readerOgLocale(sourceLanguage: string | null | undefined): string {
  const locale = readerCanonicalLocale(sourceLanguage);
  return locale === "en" ? "en_US" : locale === "ko" ? "ko_KR" : "ja_JP";
}

export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

/** Latest real modification time of an episode (posted or later edited). */
export function episodeLastModifiedValue(row: {
  posted_at?: string | null;
  last_edited_at?: string | null;
}): number {
  const values = [row.posted_at, row.last_edited_at]
    .map((value) => (typeof value === "string" && value ? new Date(value).getTime() : 0))
    .filter((value) => Number.isFinite(value) && value > 0);
  return values.length > 0 ? Math.max(...values) : 0;
}
