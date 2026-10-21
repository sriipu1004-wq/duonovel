import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { auditPreparedAozoraAnnotationFidelity } from "./aozora-annotation-fidelity";
import { validateManifest, type PreparedArtifact } from "./core";

const DEFAULT_IDS = [
  "aozora-000195", "aozora-000198", "aozora-000204",
  "aozora-000321", "aozora-053520",
];

function main(): void {
  const ids = process.argv.slice(2);
  const selected = ids.length > 0 ? ids : DEFAULT_IDS;
  if (selected.length > 10 || new Set(selected).size !== selected.length) {
    throw new Error("Select 1–10 unique manifest IDs");
  }
  const works = selected.map((id) => {
    if (!/^aozora-[0-9]{6}$/u.test(id)) {
      throw new Error("Unexpected manifest ID: " + id);
    }
    const manifestPath = resolve("public-domain/manifests", id + ".json");
    const preparedPath = resolve(".public-domain-work", id, "prepared.json");
    const validation = validateManifest(
      JSON.parse(readFileSync(manifestPath, "utf8")) as unknown
    );
    if (!validation.ok || !validation.manifest) {
      throw new Error("Invalid manifest: " + id + ": " + validation.errors.join("; "));
    }
    const manifest = validation.manifest;
    const artifact = JSON.parse(readFileSync(preparedPath, "utf8")) as PreparedArtifact;
    if (
      manifest.id !== id ||
      manifest.normalization_profile !== "aozora_reader_body" ||
      !manifest.source_hash ||
      artifact.manifestId !== id ||
      artifact.sourceHash !== manifest.source_hash ||
      artifact.chapters.length !== manifest.chapter_count
    ) {
      throw new Error("AOZORA_FIDELITY_SOURCE_MISMATCH: " + id);
    }
    return {
      manifestId: id,
      sourceHash: artifact.sourceHash,
      chapterCount: artifact.chapters.length,
      ...auditPreparedAozoraAnnotationFidelity(artifact),
    };
  });
  const total = {
    originalAnnotationCount: works.reduce((n, w) => n + w.originalAnnotationCount, 0),
    remainingAfterRuntimeNormalization: works.reduce(
      (n, w) => n + w.remainingAfterRuntimeNormalization, 0
    ),
    removedByRuntimeNormalization: works.reduce(
      (n, w) => n + w.removedByRuntimeNormalization, 0
    ),
  };
  console.log(JSON.stringify({
    version: 1,
    scope: "local prepared Reader bodies only; no network, DB or source-file writes",
    method: "existing EffectPreviewRenderer normalizeAozoraTextForDisplay per prepared chapter",
    works,
    total,
    decision: works.some((w) => w.manualReaderFidelityReviewRequired)
      ? "READER_FIDELITY_HOLD"
      : "ANNOTATION_NORMALIZATION_ONLY_PASS_NOT_E2E",
    humanRightsOrContentReviewPerformed: false,
    publicationAuthorized: false,
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
