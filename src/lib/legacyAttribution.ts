/**
 * Legacy official works: original author attribution WITHOUT a rights check.
 *
 * Owner decision 2026-11-15 (button 「原作者だけ先に表示 (推奨)」): 28 legacy
 * LIB read Official works have no `effect_settings.publicDomain` record
 * (rightsChecked) because the Production body has not been matched to a
 * source edition. Their protection terms are close to fully expired
 * (rights research 2026-11-15), so the original author and death year are
 * recorded separately in `effect_settings.legacyAttribution` and shown as the
 * author. Nothing here marks a work as rights-checked:
 *
 * - This reader is separate from readPublicDomainMetadata and never feeds the
 *   rightsChecked decision (Human translation eligibility, the provenance
 *   panel, the Public Domain notice, JSON-LD all keep reading publicDomain).
 * - `sourceMatchVerified` must be literally `false`. A record that claims a
 *   verified source match is rejected: a verified match belongs in
 *   publicDomain after review, never here.
 * - Display only for works of the official account (checked by the server
 *   caller, see legacyAttribution.server.ts), because series authors can
 *   write their own effect_settings.
 *
 * Pure functions only, so regression tests can import this module directly.
 */

export type LegacyAttribution = {
  originalAuthor: string;
  authorDeathYear: number;
  /** Candidate source cards (Aozora Bunko). Not verified against the body. */
  sourceCandidates: string[];
  sourceMatchVerified: false;
  jurisdictionsAssessed: string[];
  recordedAt: string;
  recordedBy: string;
};

const MAX_AUTHOR_LENGTH = 100;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseRecord(value: unknown): Record<string, unknown> | null {
  if (isRecord(value)) return value;
  if (typeof value !== "string" || value.trim().length === 0) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function cleanSourceCandidates(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const urls: string[] = [];
  for (const item of value) {
    const text = cleanText(item);
    if (!text) continue;
    try {
      const url = new URL(text);
      if (url.protocol === "https:" && url.hostname === "www.aozora.gr.jp") {
        urls.push(url.toString());
      }
    } catch {
      // ignore malformed candidates
    }
  }
  return Array.from(new Set(urls));
}

function cleanJurisdictions(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim().toUpperCase())
        .filter((item) => /^[A-Z]{2}$/.test(item))
    )
  );
}

/**
 * Reads `effect_settings.legacyAttribution`. Returns null when the record is
 * missing or malformed, when it claims a verified source match, or when the
 * same settings already carry a publicDomain record (publicDomain wins and is
 * read by readPublicDomainMetadata; the two never mix).
 */
export function readLegacyAttribution(effectSettings: unknown): LegacyAttribution | null {
  const settings = parseRecord(effectSettings);
  if (!settings) return null;
  if (Object.prototype.hasOwnProperty.call(settings, "publicDomain")) return null;
  const raw = settings.legacyAttribution;
  if (!isRecord(raw)) return null;
  if (raw.sourceMatchVerified !== false) return null;

  const originalAuthor = cleanText(raw.originalAuthor);
  if (!originalAuthor || originalAuthor.length > MAX_AUTHOR_LENGTH) return null;

  const deathYear = raw.authorDeathYear;
  if (!Number.isInteger(deathYear)) return null;
  const authorDeathYear = Number(deathYear);
  if (authorDeathYear < 1 || authorDeathYear > 9999) return null;

  const recordedAt = cleanText(raw.recordedAt);
  const recordedBy = cleanText(raw.recordedBy);
  if (!recordedAt || !recordedBy) return null;

  return {
    originalAuthor,
    authorDeathYear,
    sourceCandidates: cleanSourceCandidates(raw.sourceCandidates),
    sourceMatchVerified: false,
    jurisdictionsAssessed: cleanJurisdictions(raw.jurisdictionsAssessed),
    recordedAt,
    recordedBy,
  };
}

/**
 * The name shown as the work's (original) author: the rights-checked Public
 * Domain author first, then a legacy attribution that the server caller has
 * already accepted for display. Null when neither applies.
 */
export function resolveOriginalAuthorName(input: {
  publicDomainOriginalAuthor: string | null | undefined;
  legacyAttribution: LegacyAttribution | null | undefined;
}): string | null {
  const publicDomain = (input.publicDomainOriginalAuthor ?? "").trim();
  if (publicDomain) return publicDomain;
  const legacy = (input.legacyAttribution?.originalAuthor ?? "").trim();
  return legacy || null;
}
