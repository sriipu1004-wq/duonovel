import type { ParsedBookUnit } from "@/lib/library/bookImport";
import {
  PRIVATE_LIBRARY_LIMITS,
  countUnicodeCharacters,
} from "@/lib/library/privateLibrary";

export function parsePrivateLibraryImportUnits(
  value: unknown
): ParsedBookUnit[] | null {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.length > PRIVATE_LIBRARY_LIMITS.importBatchSize
  ) {
    return null;
  }

  const units: ParsedBookUnit[] = [];

  for (const item of value) {
    if (!item || typeof item !== "object") return null;
    const record = item as Record<string, unknown>;
    const title = typeof record.title === "string" ? record.title.trim() : "";
    const sectionTitle =
      typeof record.sectionTitle === "string"
        ? record.sectionTitle.trim()
        : "";
    // The browser parser has already normalized the prose. Preserve it exactly:
    // String.trim() also removes a Japanese full-width paragraph indent.
    const body = typeof record.body === "string" ? record.body : "";
    const sectionNumber = Number(record.sectionNumber);
    const partNumber = Number(record.partNumber);
    const partCount = Number(record.partCount);

    if (
      !title ||
      title.length > 200 ||
      !sectionTitle ||
      sectionTitle.length > 200 ||
      !body.trim() ||
      countUnicodeCharacters(body) > PRIVATE_LIBRARY_LIMITS.maxChapterChars ||
      !Number.isInteger(sectionNumber) ||
      sectionNumber < 1 ||
      sectionNumber > PRIVATE_LIBRARY_LIMITS.maxSections ||
      !Number.isInteger(partNumber) ||
      partNumber < 1 ||
      !Number.isInteger(partCount) ||
      partCount < partNumber
    ) {
      return null;
    }

    units.push({
      title,
      body,
      sectionNumber,
      sectionTitle,
      partNumber,
      partCount,
    });
  }

  return units;
}
