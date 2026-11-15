// Per-country publication restriction (owner 2026-11-15). Pure helpers shared
// by the proxy, pages and API routes. A work has either a block list (withheld
// in those countries) or an allow list (served only in those countries). The
// rule is fail-closed: a restricted work is also withheld from a visitor whose
// country is unknown.

/** Set by Vercel on every request: ISO 3166-1 alpha-2 of the client IP. */
export const REQUEST_COUNTRY_HEADER = "x-vercel-ip-country";

export type RegionPolicy = {
  readonly mode: "block" | "allow";
  readonly countries: readonly string[];
};

export type RegionRestrictionMap = ReadonlyMap<string, RegionPolicy>;

const COUNTRY_CODE = /^[A-Z]{2}$/;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function normalizeCountryCode(
  value: string | null | undefined
): string | null {
  if (typeof value !== "string") return null;
  const code = value.trim().toUpperCase();
  return COUNTRY_CODE.test(code) ? code : null;
}

/**
 * True when the visitor must not receive the work. No restriction -> false.
 * Restricted and the country is unknown -> true (fail closed).
 */
export function isBlockedInCountry(
  policy: RegionPolicy | null | undefined,
  country: string | null
): boolean {
  if (!policy) return false;
  if (!country) return true;
  return policy.mode === "allow"
    ? !policy.countries.includes(country)
    : policy.countries.includes(country);
}

export function isSeriesBlockedInCountry(
  map: RegionRestrictionMap,
  seriesId: string | null | undefined,
  country: string | null
): boolean {
  if (!seriesId) return false;
  return isBlockedInCountry(map.get(seriesId.toLowerCase()), country);
}

function isCountryList(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((code) => typeof code === "string" && COUNTRY_CODE.test(code))
  );
}

export const REGION_RESTRICTION_SELECT = "series_id,blocked_countries,allowed_countries";

/**
 * Validates rows from series_region_restrictions. Throws on any malformed row
 * so a broken table never silently turns into "no restrictions".
 */
export function parseRegionRestrictionRows(rows: unknown): Map<string, RegionPolicy> {
  if (!Array.isArray(rows)) {
    throw new Error("region restrictions: rows is not an array");
  }
  const map = new Map<string, RegionPolicy>();
  for (const row of rows) {
    const record = (row ?? {}) as {
      series_id?: unknown;
      blocked_countries?: unknown;
      allowed_countries?: unknown;
    };
    const seriesId = record.series_id;
    if (typeof seriesId !== "string" || !UUID.test(seriesId)) {
      throw new Error("region restrictions: invalid series_id");
    }
    const blocked = record.blocked_countries ?? null;
    const allowed = record.allowed_countries ?? null;
    let policy: RegionPolicy;
    if (blocked !== null && allowed === null && isCountryList(blocked)) {
      policy = { mode: "block", countries: [...new Set(blocked)] };
    } else if (allowed !== null && blocked === null && isCountryList(allowed)) {
      policy = { mode: "allow", countries: [...new Set(allowed)] };
    } else {
      throw new Error("region restrictions: need exactly one valid country list");
    }
    map.set(seriesId.toLowerCase(), policy);
  }
  return map;
}

/**
 * The series id of a page route that serves a work's text, translations or
 * recording flow, after the UI-locale prefix has been stripped. The per-work
 * Open Graph image (title / author only) is not guarded.
 */
export function extractRegionGuardedSeriesId(pathname: string): string | null {
  const match =
    /^\/(?:works|locale-work|read|translate)\/([^/]+)(?:\/(.*))?$/.exec(pathname) ??
    /^\/record\/create\/([^/]+)(?:\/(.*))?$/.exec(pathname);
  if (!match) return null;
  const [, id, rest] = match;
  if (!UUID.test(id)) return null;
  if (rest && /^opengraph-image(?:-[^/]*)?$/.test(rest)) return null;
  return id.toLowerCase();
}

export const REGION_BLOCKED_STATUS = 451;

const BLOCKED_MESSAGE = {
  ja: "この作品は、お住まいの国・地域ではまだ著作権の保護期間中のため、公開していません。",
  en: "This work is still under copyright in your country or region, so it is not available here.",
  ko: "이 작품은 귀하의 국가·지역에서 아직 저작권 보호 기간 중이므로 공개하지 않습니다.",
} as const;

export type RegionBlockedLocale = keyof typeof BLOCKED_MESSAGE;

export function regionBlockedMessage(locale: string | null | undefined): string {
  return BLOCKED_MESSAGE[(locale as RegionBlockedLocale) in BLOCKED_MESSAGE
    ? (locale as RegionBlockedLocale)
    : "ja"];
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Minimal standalone page for the proxy's 451 response. */
export function regionBlockedHtml(locale: string | null | undefined): string {
  const lang = (locale as RegionBlockedLocale) in BLOCKED_MESSAGE ? locale : "ja";
  const message = escapeHtml(regionBlockedMessage(lang));
  const home = lang === "ja" ? "/" : `/${lang}`;
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>LIB read</title><style>body{font-family:system-ui,sans-serif;max-width:40rem;margin:4rem auto;padding:0 1rem;line-height:1.7;color:#1f2937}a{color:#2563eb}</style></head><body><h1>LIB read</h1><p>${message}</p><p><a href="${home}">LIB read</a></p></body></html>`;
}
