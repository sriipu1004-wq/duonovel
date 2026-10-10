import { normalizeSeriesContentWarnings } from "@/lib/contentRating";
import { parseSupportedLanguageTag } from "@/lib/translation/languageRegistry";
import { isOwnedSeriesWorkspacePayload } from "@/lib/write/ownedSeriesPayload";

/** New-work classification must not pass through an intermediate published row. */
export function validateOwnedSeriesCreationPayload(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const { source_language: submittedLanguage, content_warnings: submittedWarnings, ...workspace } =
    value as Record<string, unknown>;
  if (!isOwnedSeriesWorkspacePayload(workspace)) return null;
  const language = parseSupportedLanguageTag(submittedLanguage);
  if (!language || submittedLanguage !== language) return null;
  if (!Array.isArray(submittedWarnings) || submittedWarnings.length > 2) return null;
  const warnings = normalizeSeriesContentWarnings(submittedWarnings);
  if (warnings.length !== submittedWarnings.length ||
    !submittedWarnings.every((w) => w === "sexual_r18" || w === "violence")) return null;
  // Content rating is derived, not caller-supplied; warning locks stay server controlled.
  return {
    ...workspace,
    source_language: language,
    content_warnings: warnings,
    content_rating: warnings.includes("sexual_r18") ? "r18" : "general",
  };
}
