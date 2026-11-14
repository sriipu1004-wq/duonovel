// Issue #154 GI-P2: ingest-side filtering for /api/popularity/events.
//
// Popularity rows feed the public ranking (series_popularity_daily). GI-P1
// found that ~64% of the last 28 days of rows came from requests Vercel
// classified as AI crawlers (mostly `meta-externalagent`) and that anyone with a
// public series/episode UUID could create rows with a direct POST.
//
// This module is pure (no I/O) so the decisions can be unit-tested. A rejected
// request is answered with 202 and no row is written: the browser client treats
// any 2xx as "done" and stops retrying, and bots learn nothing useful.
//
// Limits of what this can prove (recorded on purpose):
// - User-Agent, Origin, Referer and Sec-Fetch-Site are all client-controlled.
//   A determined script can forge them. These checks remove declared crawlers,
//   headless automation that announces itself, and naive cross-site / direct
//   POSTs. The per-actor daily cap (see POPULARITY_DAILY_ROW_CAP) bounds what a
//   single actor (user id, or the IP that Vercel writes into x-forwarded-for)
//   can add even when every header is forged.
// - Nothing here identifies a person; only a reason label is logged.

export type PopularityIngestSkipReason =
  | "missing_user_agent"
  | "bot_user_agent"
  | "automation_user_agent"
  | "cross_site_fetch"
  | "foreign_origin"
  | "foreign_referer"
  | "missing_origin_and_referer"
  | "daily_cap_reached"
  | "daily_series_cap_reached";

export type PopularityIngestDecision =
  | { accept: true }
  | { accept: false; reason: PopularityIngestSkipReason };

/**
 * Maximum number of rows one actor may create per JST day, per event table.
 *
 * The actor is the existing `session_id`, which is already
 * sha256(salt, JST day, user id or client IP); one actor-day = one session_id.
 *
 * Basis (production aggregate, read-only, 2026-11-14, all rows since 2026-05):
 * - Outside the 10/17–20 and 10/26–28 anomalies, the largest actor-day was
 *   7 rows (signed-in) and 5 rows (anonymous); p99 was 7 and 3.
 * - Even inside the 10/26–28 AI-crawler burst, the largest actor-day was 32
 *   rows; the burst was spread over ~700 actor-days.
 * - A heavy reader may binge "several dozen" short web-novel episodes in a day,
 *   and many anonymous readers can share one IP (mobile CGNAT, schools).
 * 100 leaves >3x headroom over "several dozen", ~14x over the observed honest
 * maximum, and would not have removed any historical row. It is a backstop
 * against a single-source flood, not the primary crawler defence.
 */
export const POPULARITY_DAILY_ROW_CAP = 100;

/**
 * Maximum number of rows one actor may add to ONE series per JST day, per
 * event table (owner decision on PR #189, 2026-11-14).
 *
 * The total cap above only turns "unlimited" into 100, which is still large
 * next to the current traffic (a handful of honest rows per actor-day), and
 * 100 rows on one series is enough to move the ranking on its own. Ranking is
 * per series, so the per-series cap is the one that bounds how far one actor
 * can push one work. Honest maximum observed: 7 rows per actor-day in total;
 * 30 still covers reading 30 episodes of one work in a day.
 */
export const POPULARITY_DAILY_SERIES_ROW_CAP = 30;

// Declared crawlers / AI agents / link-preview fetchers. Matched
// case-insensitively against the User-Agent. Kept explicit so that phone model
// names containing "bot" (e.g. "CUBOT") are not caught by a bare substring.
const DECLARED_BOT_TOKENS = [
  "googlebot",
  "google-extended",
  "googleother",
  "google-inspectiontool",
  "adsbot-google",
  "mediapartners-google",
  "apis-google",
  "feedfetcher-google",
  "storebot-google",
  "bingbot",
  "bingpreview",
  "msnbot",
  "adidxbot",
  "yandexbot",
  "baiduspider",
  "duckduckbot",
  "duckassistbot",
  "slurp",
  "applebot",
  "petalbot",
  "sogou web spider",
  "seznambot",
  "yeti/",
  "daumoa",
  "meta-externalagent",
  "meta-externalfetcher",
  "facebookexternalhit",
  "facebookcatalog",
  "facebot",
  "gptbot",
  "chatgpt-user",
  "chatgpt-operator",
  "oai-searchbot",
  "claudebot",
  "claude-user",
  "claude-searchbot",
  "claude-web",
  "anthropic-ai",
  "perplexitybot",
  "perplexity-user",
  "bytespider",
  "tiktokspider",
  "ccbot",
  "amazonbot",
  "cohere-ai",
  "diffbot",
  "youbot",
  "mistralai-user",
  "ai2bot",
  "timpibot",
  "omgili",
  "imagesiftbot",
  "semrushbot",
  "ahrefsbot",
  "mj12bot",
  "dotbot",
  "dataforseobot",
  "blexbot",
  "serpstatbot",
  "twitterbot",
  "linkedinbot",
  "slackbot",
  "discordbot",
  "telegrambot",
  "skypeuripreview",
  "pinterestbot",
  "redditbot",
  "embedly",
  "iframely",
  "bitlybot",
  "vercelbot",
  "vercel-screenshot",
  "uptimerobot",
  "pingdom",
  "statuscake",
];

// Generic crawler shapes: "(compatible; FooBot/1.0; +https://example.com/bot)".
const GENERIC_BOT_PATTERNS: RegExp[] = [
  /compatible;[^)]*\b[a-z0-9_-]*(?:bot|crawler|spider|scraper)\b/i,
  /\+https?:\/\//i,
  /\b(?:crawler|spider|scraper)\b/i,
];

// Automation libraries / HTTP clients that a browser reader never sends.
const AUTOMATION_PATTERNS: RegExp[] = [
  /headless/i,
  /phantomjs/i,
  /puppeteer/i,
  /playwright/i,
  /selenium/i,
  /webdriver/i,
  /\bjsdom\b/i,
  /^curl\//i,
  /^wget\//i,
  /^python-(?:requests|urllib|httpx)/i,
  /\baiohttp\//i,
  /^httpx\//i,
  /^go-http-client\//i,
  /^node-fetch/i,
  /^undici/i,
  /^node$/i,
  /^axios\//i,
  /^okhttp\//i,
  /^java\//i,
  /^apache-httpclient\//i,
  /^libwww-perl/i,
  /^ruby/i,
  /^php\//i,
  /^guzzlehttp/i,
  /^postmanruntime\//i,
  /^insomnia\//i,
  /^deno\//i,
  /^bun\//i,
  /\bscrapy\//i,
];

export function classifyPopularityUserAgent(
  userAgent: string | null | undefined
): PopularityIngestDecision {
  const ua = (userAgent ?? "").trim();
  if (!ua) {
    return { accept: false, reason: "missing_user_agent" };
  }

  const lower = ua.toLowerCase();
  if (DECLARED_BOT_TOKENS.some((token) => lower.includes(token))) {
    return { accept: false, reason: "bot_user_agent" };
  }
  if (GENERIC_BOT_PATTERNS.some((pattern) => pattern.test(ua))) {
    return { accept: false, reason: "bot_user_agent" };
  }
  if (AUTOMATION_PATTERNS.some((pattern) => pattern.test(ua))) {
    return { accept: false, reason: "automation_user_agent" };
  }

  return { accept: true };
}

function hostOf(value: string | null | undefined): string | null {
  const text = (value ?? "").trim();
  if (!text || text === "null") return null;
  try {
    return new URL(text).host.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * The host the browser actually addressed. On Vercel, `host` and
 * `x-forwarded-host` are the domain the client visited
 * (https://vercel.com/docs/headers/request-headers#host). A forged Host header
 * would route the request to a different deployment, so comparing the request
 * Origin with it is a same-site check that also works for Preview and local
 * development without a hard-coded domain list.
 */
export function requestHost(headers: Headers, requestUrl?: string): string | null {
  const forwarded = headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwarded || headers.get("host")?.trim();
  if (host) return host.toLowerCase();
  return hostOf(requestUrl);
}

export function classifyPopularityRequestSource(
  headers: Headers,
  requestUrl?: string
): PopularityIngestDecision {
  // Modern browsers send Sec-Fetch-Site on every fetch. The Reader posts from
  // the same origin, so anything else is not our page.
  const fetchSite = headers.get("sec-fetch-site")?.trim().toLowerCase();
  if (fetchSite && fetchSite !== "same-origin") {
    return { accept: false, reason: "cross_site_fetch" };
  }

  const ownHost = requestHost(headers, requestUrl);
  const origin = headers.get("origin");
  // Browsers send Origin on every POST fetch, including same-origin ones.
  // `Origin: null` (opaque origin, e.g. some privacy modes) carries no site
  // information. When the browser also says same-origin, accept it: both
  // headers are client-controlled anyway, so this does not weaken the check.
  if (origin?.trim() === "null" && fetchSite === "same-origin") {
    return { accept: true };
  }
  if (origin !== null && origin.trim() !== "") {
    const originHost = hostOf(origin);
    if (!originHost || !ownHost || originHost !== ownHost) {
      return { accept: false, reason: "foreign_origin" };
    }
    return { accept: true };
  }

  // Fallback for clients that omit Origin: require a same-host Referer.
  // The site's Referrer-Policy is strict-origin-when-cross-origin, so a
  // same-origin fetch carries the full Referer.
  const referer = headers.get("referer");
  if (referer !== null && referer.trim() !== "") {
    const refererHost = hostOf(referer);
    if (!refererHost || !ownHost || refererHost !== ownHost) {
      return { accept: false, reason: "foreign_referer" };
    }
    return { accept: true };
  }

  return { accept: false, reason: "missing_origin_and_referer" };
}

/** Header-only checks, run before any database work. */
export function classifyPopularityIngestRequest(
  headers: Headers,
  requestUrl?: string
): PopularityIngestDecision {
  const byAgent = classifyPopularityUserAgent(headers.get("user-agent"));
  if (!byAgent.accept) return byAgent;
  return classifyPopularityRequestSource(headers, requestUrl);
}

/** Cap check: `existingRows` is the actor's rows already stored today. */
export function classifyPopularityDailyCap(
  existingRows: number,
  cap: number = POPULARITY_DAILY_ROW_CAP
): PopularityIngestDecision {
  if (!Number.isFinite(existingRows) || existingRows < 0) {
    // Unknown count: fail closed for ranking input (the reader is unaffected).
    return { accept: false, reason: "daily_cap_reached" };
  }
  return existingRows >= cap
    ? { accept: false, reason: "daily_cap_reached" }
    : { accept: true };
}

/**
 * Two-level cap. `actorSeriesIds` is the series_id of each row this actor
 * already stored today in one event table (null = could not be read).
 * The total cap is checked first, then the per-series cap for `seriesId`.
 */
export function classifyPopularityActorCaps(args: {
  actorSeriesIds: readonly string[] | null;
  seriesId: string;
  totalCap?: number;
  seriesCap?: number;
}): PopularityIngestDecision {
  if (args.actorSeriesIds === null) {
    // Unknown count: fail closed for ranking input (the reader is unaffected).
    return { accept: false, reason: "daily_cap_reached" };
  }
  const total = classifyPopularityDailyCap(
    args.actorSeriesIds.length,
    args.totalCap ?? POPULARITY_DAILY_ROW_CAP
  );
  if (!total.accept) return total;

  const seriesRows = args.actorSeriesIds.filter((id) => id === args.seriesId).length;
  return seriesRows >= (args.seriesCap ?? POPULARITY_DAILY_SERIES_ROW_CAP)
    ? { accept: false, reason: "daily_series_cap_reached" }
    : { accept: true };
}

/** Log line contains only the reason label: no UA text, IP, or ids. */
export function logPopularityIngestSkip(reason: PopularityIngestSkipReason): void {
  console.info("[popularity-ingest-skip]", reason);
}
