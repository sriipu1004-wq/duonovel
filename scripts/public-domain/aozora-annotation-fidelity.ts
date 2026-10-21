import { normalizeAozoraTextForDisplay } from "../../src/features/effects/EffectPreviewRenderer";
import type { PreparedArtifact } from "./core";

export const AOZORA_ANNOTATION_CATEGORIES = [
  "layout", "emphasis", "edition_variant", "gaiji", "ruby_note", "unclassified",
] as const;

export type AozoraAnnotationCategory = (typeof AOZORA_ANNOTATION_CATEGORIES)[number];
export type AozoraAnnotationCounts = Record<AozoraAnnotationCategory, number>;

export type AozoraAnnotationFidelityReport = {
  originalAnnotationCount: number;
  remainingAfterRuntimeNormalization: number;
  removedByRuntimeNormalization: number;
  sourceByCategory: AozoraAnnotationCounts;
  remainingByCategory: AozoraAnnotationCounts;
  unclassifiedAnnotationsRemain: boolean;
  manualReaderFidelityReviewRequired: boolean;
};

const AOZORA_ANNOTATION_PATTERN = /［＃([^］\r\n]{1,200})］/gu;

function emptyCounts(): AozoraAnnotationCounts {
  return {
    layout: 0, emphasis: 0, edition_variant: 0,
    gaiji: 0, ruby_note: 0, unclassified: 0,
  };
}

export function classifyAozoraAnnotation(content: string): AozoraAnnotationCategory {
  // Decision order is intentionally conservative: edition/textual annotations
  // and non-Unicode gaiji cannot be discarded as pure layout.
  if (content.includes("底本")) return "edition_variant";
  if (content.includes("傍点")) return "emphasis";
  if (/第[234]水準|[0-9]-[0-9]+-[0-9]+|外字/u.test(content)) return "gaiji";
  if (content.includes("ルビ")) return "ruby_note";
  if (/ここから|ここで|字下げ|字上げ|地から|地付き|改ページ|改丁|改見開き|改行|小さな文字|太字|段階|中見出し/u.test(content)) {
    return "layout";
  }
  return "unclassified";
}

function countAozoraAnnotations(text: string): {
  total: number;
  counts: AozoraAnnotationCounts;
} {
  const counts = emptyCounts();
  let total = 0;
  for (const match of text.matchAll(AOZORA_ANNOTATION_PATTERN)) {
    const category = classifyAozoraAnnotation(match[1] ?? "");
    counts[category] += 1;
    total += 1;
  }
  return { total, counts };
}

/**
 * Audit the actual renderer's text-normalization step, not a guessed regex
 * approximation. This is NOT browser E2E, source rights clearance, or a
 * license to strip annotations from stored raw text.
 */
export function auditPreparedAozoraAnnotationFidelity(
  artifact: Pick<PreparedArtifact, "chapters">
): AozoraAnnotationFidelityReport {
  const source = artifact.chapters.map((chapter) => chapter.body).join("\n");
  const normalizedForReader = artifact.chapters
    .map((chapter) => normalizeAozoraTextForDisplay(chapter.body))
    .join("\n");
  const original = countAozoraAnnotations(source);
  const remaining = countAozoraAnnotations(normalizedForReader);
  if (remaining.total > original.total) {
    throw new Error("AOZORA_ANNOTATION_COUNT_INCREASE: audit requires manual review");
  }
  const removedByRuntimeNormalization = original.total - remaining.total;
  return {
    originalAnnotationCount: original.total,
    remainingAfterRuntimeNormalization: remaining.total,
    removedByRuntimeNormalization,
    sourceByCategory: original.counts,
    remainingByCategory: remaining.counts,
    unclassifiedAnnotationsRemain: remaining.counts.unclassified > 0,
    manualReaderFidelityReviewRequired: remaining.total > 0,
  };
}
