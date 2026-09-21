export type PublicDomainMetadata = {
  manifestId: string;
  originalTitle: string | null;
  originalAuthor: string;
  firstPublicationYear: number | null;
  sourceProvider: string;
  sourceUrl: string | null;
  sourceHash: string;
  rightsChecked: true;
  reviewedAt: string | null;
  jurisdictionsReviewed: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseRecord(value: unknown): Record<string, unknown> | null {
  if (isRecord(value)) return value;
  if (typeof value !== "string" || value.trim().length === 0) return null;
  try {
    const parsed = JSON.parse(value);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function cleanOptionalText(value: unknown): string | null {
  const text = cleanText(value);
  return text || null;
}

function cleanSourceUrl(value: unknown): string | null {
  const text = cleanText(value);
  if (!text) return null;
  try {
    const url = new URL(text);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function cleanYear(value: unknown): number | null {
  if (!Number.isInteger(value)) return null;
  const year = Number(value);
  return year >= 1 && year <= 9999 ? year : null;
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

export function readPublicDomainMetadata(effectSettings: unknown): PublicDomainMetadata | null {
  const settings = parseRecord(effectSettings);
  const raw = settings?.publicDomain;
  if (!isRecord(raw) || raw.rightsChecked !== true) return null;

  const manifestId = cleanText(raw.manifestId);
  const originalAuthor = cleanText(raw.originalAuthor);
  const sourceProvider = cleanText(raw.sourceProvider);
  const sourceHash = cleanText(raw.sourceHash);

  if (
    !manifestId ||
    !originalAuthor ||
    !sourceProvider ||
    !/^[a-f0-9]{64}$/.test(sourceHash)
  ) {
    return null;
  }

  return {
    manifestId,
    originalTitle: cleanOptionalText(raw.originalTitle),
    originalAuthor,
    firstPublicationYear: cleanYear(raw.firstPublicationYear),
    sourceProvider,
    sourceUrl: cleanSourceUrl(raw.sourceUrl),
    sourceHash,
    rightsChecked: true,
    reviewedAt: cleanOptionalText(raw.reviewedAt),
    jurisdictionsReviewed: cleanJurisdictions(raw.jurisdictionsReviewed),
  };
}
