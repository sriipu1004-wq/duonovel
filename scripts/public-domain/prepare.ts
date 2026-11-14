import { violenceAdvisoryLines } from "./content-warnings";
import { chapterPlanSha256 } from "./core";
import { loadManifest, prepareManifest } from "./runtime";

const id = process.argv.slice(2).find((value) => !value.startsWith("--"));
if (!id) throw new Error("Usage: npm run public-domain:prepare -- <manifest-id>");
const artifact = prepareManifest(id);
console.log(`Manifest: ${artifact.manifestId}`);
console.log(`Source hash: ${artifact.sourceHash}`);
console.log(`Chapters: ${artifact.chapters.length}`);
console.log(`Characters: ${artifact.displayCharacterCount}`);
console.log(`Archive metadata characters: ${artifact.archiveMetadataCharacterCount}`);
for (const chapter of artifact.chapters.slice(0, 30)) {
  console.log(`  ${chapter.number}. ${chapter.title} (${chapter.characterCount} chars)`);
}
if (artifact.chapters.length > 30) {
  console.log(`  ... ${artifact.chapters.length - 30} more chapters`);
}
console.log(`Chapter plan sha256: ${chapterPlanSha256(artifact.chapters)}`);
for (const warning of artifact.warnings) console.warn(`WARN: ${warning}`);
// Advisory only: recommends a human review for a `violence` warning; never
// writes content_warnings.
for (const line of violenceAdvisoryLines({
  manifestId: artifact.manifestId,
  text: artifact.chapters.map((chapter) => chapter.body).join("\n\n"),
  recordedWarnings: loadManifest(id).content_warnings,
})) {
  console.warn(line);
}
console.log("Prepared only. No database write was performed.");
