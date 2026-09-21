import { prepareManifest } from "./runtime";

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
for (const warning of artifact.warnings) console.warn(`WARN: ${warning}`);
console.log("Prepared only. No database write was performed.");
