import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { selectExactJapaneseProbes, publicJaExactProbeSql } from "./prose-duplicate-probes";
import { validateManifest, type PreparedArtifact } from "./core";

const DEFAULT_IDS = [
  "aozora-000195", "aozora-000198", "aozora-000204",
  "aozora-000321", "aozora-053520",
];

function main(): void {
  const params = process.argv.slice(2);
  const sqlMode = params.includes("--sql");
  if (params.some((arg) => arg.startsWith("-") && arg !== "--sql")) {
    throw new Error("UNKNOWN_OPTION");
  }
  const ids = params.filter((arg) => arg !== "--sql");
  const selected = ids.length === 0 ? DEFAULT_IDS : ids;
  if (selected.length > 10 || new Set(selected).size !== selected.length) {
    throw new Error("EXACT_PROBE_BATCH_MUST_HAVE_UP_TO_TEN_UNIQUE_IDS");
  }
  const probes = selected.flatMap((id) => {
    if (!/^aozora-[0-9]{6}$/u.test(id)) throw new Error("INVALID_MANIFEST_ID");
    const validation = validateManifest(JSON.parse(readFileSync(
      resolve("public-domain/manifests", id + ".json"), "utf8"
    )) as unknown);
    if (!validation.ok || !validation.manifest) throw new Error("MANIFEST_NOT_VALID: " + id);
    const manifest = validation.manifest;
    const artifact = JSON.parse(readFileSync(
      resolve(".public-domain-work", id, "prepared.json"), "utf8"
    )) as PreparedArtifact;
    if (manifest.original_language !== "ja" ||
        manifest.normalization_profile !== "aozora_reader_body" ||
        manifest.id !== id ||
        artifact.manifestId !== id ||
        artifact.sourceHash !== manifest.source_hash ||
        artifact.chapters.length !== manifest.chapter_count) {
      throw new Error("EXACT_PROBE_UNVERIFIED_SOURCE: " + id);
    }
    return selectExactJapaneseProbes(id, artifact.chapters);
  });
  if (sqlMode) {
    // This opt-in local output alone contains the literal excerpt strings.
    console.log(publicJaExactProbeSql(probes));
  } else {
    console.log(JSON.stringify({
      method: "verbatim-contiguous-source-phrases",
      scope: "Local prepared artifact only; no DB/network connection",
      selectedWorks: selected.length,
      probes: probes.map(({ manifestId, ordinal, characterCount, phraseSha256 }) => ({
        manifestId, ordinal, characterCount, phraseSha256,
      })),
      sourceTextIncluded: false,
      cannotExcludeSemanticEditionOrTranslationDuplicates: true,
    }, null, 2));
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
