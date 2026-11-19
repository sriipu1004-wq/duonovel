// Decide chapter_split for each new manifest: single when the normalized
// body fits 10,000 characters, else paragraph_chunks (8,000 target).
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  decodeSourceBytes,
  normalizeSource,
  normalizationOptionsFor,
  prepareArtifact,
  validateManifest,
  PUBLIC_DOMAIN_EPISODE_MAX_CHARACTERS,
} from "./core";

const root = process.cwd();
const ids = process.argv.slice(2);
for (const id of ids) {
  const path = resolve(root, `public-domain/manifests/${id}.json`);
  const manifest = JSON.parse(readFileSync(path, "utf8"));
  const raw = readFileSync(resolve(root, manifest.source_file));
  const text = normalizeSource(
    decodeSourceBytes(new Uint8Array(raw), manifest.source_encoding),
    manifest.normalization_profile,
    normalizationOptionsFor(manifest)
  ).displayText;
  manifest.chapter_split =
    text.length <= PUBLIC_DOMAIN_EPISODE_MAX_CHARACTERS
      ? { strategy: "single" }
      : { strategy: "paragraph_chunks", max_characters: 10000 };
  const v = validateManifest(manifest);
  if (!v.ok || !v.manifest) {
    console.log(`INVALID ${id}: ${v.errors.join("; ")}`);
    continue;
  }
  try {
    const art = prepareArtifact({ manifest: v.manifest!, rawBytes: new Uint8Array(raw) });
    manifest.chapter_count = art.chapters.length;
    writeFileSync(path, JSON.stringify(manifest, null, 2) + "\n");
    console.log(`OK ${id} ${manifest.title} chars=${text.length} chapters=${art.chapters.length} warnings=${art.warnings.length}`);
  } catch (error) {
    console.log(`FAIL ${id} ${manifest.title}: ${(error as Error).message.split("\n")[0]}`);
  }
}
