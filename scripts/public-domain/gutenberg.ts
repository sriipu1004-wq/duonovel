export function isAllowedGutenbergTextUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.hostname !== "www.gutenberg.org" ||
      url.username ||
      url.password ||
      url.port ||
      url.search ||
      url.hash
    ) {
      return false;
    }
    const match = /^\/cache\/epub\/(\d+)\/pg(\d+)\.txt$/u.exec(url.pathname);
    return Boolean(match && match[1] === match[2]);
  } catch {
    return false;
  }
}

export function gutenbergEbookNumberFromTextUrl(value: string): number | null {
  if (!isAllowedGutenbergTextUrl(value)) return null;
  const url = new URL(value);
  const match = /^\/cache\/epub\/(\d+)\/pg\d+\.txt$/u.exec(url.pathname);
  return match ? Number(match[1]) : null;
}

// Fallback route used while www.gutenberg.org is unavailable (2026-11-20:
// rebuilding after vandalism). Opt-in only (PUBLIC_DOMAIN_GUTENBERG_MIRROR=pglaf).
// The manifest keeps the canonical www.gutenberg.org URLs; the text comes from
// the Project Gutenberg Literary Archive Foundation's own mirror, the US-PD
// statement from that mirror's catalog RDF, and the body is cross-checked
// against an independent mirror's archive copy before it is pinned.
// Limit of the cross-check: it only detects a body that differs between the
// two mirrors (e.g. one mirror altered). It cannot detect a change made
// upstream before both mirrors copied it, nor check the rights statement
// (the RDF comes from the PGLAF mirror only). Independent review of #228.
export const GUTENBERG_MIRROR_ORIGIN = "https://gutenberg.pglaf.org";
export const GUTENBERG_CROSSCHECK_ORIGIN = "https://mirrors.xmission.com/gutenberg";

export function gutenbergArchiveDir(ebookNumber: number): string {
  if (!Number.isSafeInteger(ebookNumber) || ebookNumber <= 0) {
    throw new Error(`invalid Gutenberg ebook number ${ebookNumber}`);
  }
  const digits = String(ebookNumber);
  const prefix = digits.length === 1 ? "0" : digits.slice(0, -1).split("").join("/");
  return `${prefix}/${digits}`;
}

export function gutenbergMirrorUrls(ebookNumber: number) {
  const dir = gutenbergArchiveDir(ebookNumber);
  return {
    text: `${GUTENBERG_MIRROR_ORIGIN}/cache/epub/${ebookNumber}/pg${ebookNumber}.txt`,
    rdf: `${GUTENBERG_MIRROR_ORIGIN}/cache/epub/${ebookNumber}/pg${ebookNumber}.rdf`,
    crossCheck: [
      `${GUTENBERG_CROSSCHECK_ORIGIN}/${dir}/${ebookNumber}-0.txt`,
      `${GUTENBERG_CROSSCHECK_ORIGIN}/${dir}/${ebookNumber}.txt`,
    ],
  };
}

export function gutenbergRdfDeclaresUsPublicDomain(rdf: string, ebookNumber: number): boolean {
  return (
    rdf.includes(`rdf:about="ebooks/${ebookNumber}"`) &&
    /<dcterms:rights>\s*Public domain in the USA\.\s*<\/dcterms:rights>/u.test(rdf)
  );
}

// Text between the "*** START OF" and "*** END OF" lines, CR removed and
// trailing blank lines dropped. Null when either marker is missing.
export function gutenbergBodyBetweenMarkers(text: string): string | null {
  const lines = text.replace(/^﻿/u, "").replace(/\r/gu, "").split("\n");
  const start = lines.findIndex((line) => /^\*\*\*\s*START OF/iu.test(line));
  if (start < 0) return null;
  const endOffset = lines.slice(start + 1).findIndex((line) => /^\*\*\*\s*END OF/iu.test(line));
  if (endOffset < 0) return null;
  const body = lines
    .slice(start + 1, start + 1 + endOffset)
    .map((line) => line.replace(/[ \t]+$/u, ""));
  // Some copies end the body with a PG sign-off paragraph ("End of the
  // Project Gutenberg EBook of ..."). Older archive copies usually have it and
  // newer cache/epub builds usually do not, but some cache/epub copies have it
  // too (e.g. #146, #805). It is dropped from every copy before comparison;
  // only trailing blank lines and that one paragraph are removed.
  const trimBlank = () => {
    while (body.length > 0 && body[body.length - 1] === "") body.pop();
  };
  trimBlank();
  const lastParagraphStart = body.lastIndexOf("") + 1;
  if (/^End of (?:the |this )?Project Gutenberg/iu.test(body[lastParagraphStart] ?? "")) {
    body.length = lastParagraphStart;
    trimBlank();
  }
  return body.join("\n");
}

// Ebook numbers stated in the PG header before the "*** START OF" line, e.g.
// "Release date: May 1, 1997 [eBook #921]" or "[EBook #1342]".
export function gutenbergHeaderEbookNumbers(text: string): number[] {
  const lines = text.replace(/^﻿/u, "").replace(/\r/gu, "").split("\n");
  const start = lines.findIndex((line) => /^\*\*\*\s*START OF/iu.test(line));
  const header = (start < 0 ? lines : lines.slice(0, start)).join("\n");
  return Array.from(header.matchAll(/\[\s*E(?:Book|Text)\s*#\s*(\d+)\s*\]/giu), (match) =>
    Number(match[1])
  );
}

// True only when the header names this ebook number and no other.
export function gutenbergHeaderMatchesEbookNumber(text: string, ebookNumber: number): boolean {
  const numbers = gutenbergHeaderEbookNumbers(text);
  return numbers.length > 0 && numbers.every((n) => n === ebookNumber);
}

// Machine-readable record of where a pinned Gutenberg source was fetched
// (manifest field source_fetch). Written by source-sync.ts when it pins a hash.
export type GutenbergSourceFetch =
  | { route: "www"; text_url: string; fetched_at: string }
  | {
      route: "pglaf_mirror";
      text_url: string;
      catalog_rdf_url: string;
      cross_check_url: string;
      fetched_at: string;
    };

// Route used for an already pinned source: source_fetch.route when recorded,
// otherwise inferred from the rights_notes wording of the 2026-11 batch,
// otherwise null (unknown).
export function pinnedGutenbergFetchRoute(manifest: {
  source_fetch?: unknown;
  rights_notes?: unknown;
}): "www" | "pglaf_mirror" | null {
  const record = manifest.source_fetch;
  if (record && typeof record === "object" && !Array.isArray(record)) {
    const route = (record as { route?: unknown }).route;
    if (route === "www" || route === "pglaf_mirror") return route;
  }
  if (
    typeof manifest.rights_notes === "string" &&
    manifest.rights_notes.includes("gutenberg.pglaf.org")
  ) {
    return "pglaf_mirror";
  }
  return null;
}
