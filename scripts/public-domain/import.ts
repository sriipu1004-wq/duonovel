import {
  displaySupabaseTarget,
  importManifest,
  loadLocalEnvironment,
  loadManifest,
  loadPreparedArtifact,
} from "./runtime";

async function main() {
const args = process.argv.slice(2);
const id = args.find((value) => !value.startsWith("--"));
if (!id) {
  throw new Error(
    "Usage: npm run public-domain:import -- <manifest-id> [--execute --target=local|preview|production --production]"
  );
}
const forbidden = ["--publish", "--public", "--translate", "--author-id"];
for (const flag of forbidden) {
  if (args.some((value) => value === flag || value.startsWith(`${flag}=`))) {
    throw new Error(`${flag} is not supported by the Public Domain importer`);
  }
}
const execute = args.includes("--execute");
const productionConfirmed = args.includes("--production");
const targetRaw = args.find((value) => value.startsWith("--target="))?.slice("--target=".length) ?? null;
const target =
  targetRaw === "local" || targetRaw === "preview" || targetRaw === "production"
    ? targetRaw
    : null;
if (targetRaw && !target) throw new Error(`Invalid --target: ${targetRaw}`);

if (execute) loadLocalEnvironment();

const manifest = loadManifest(id);
const artifact = loadPreparedArtifact(id);
console.log(`Manifest: ${manifest.id}`);
console.log(`Rights: ${manifest.rights_status} / approved=${manifest.approved}`);
console.log(`Source: ${manifest.source_provider}`);
console.log(`Language: ${manifest.original_language}`);
console.log(`Original author: ${manifest.original_author}`);
console.log(`Chapters: ${artifact.chapters.length}`);
console.log(`Characters: ${artifact.displayCharacterCount}`);
console.log("Target account: LIB read Official (canonical account resolver; no CLI override)");
console.log("Publication state: private series + draft episodes only");
console.log(`Dry run: ${execute ? "no" : "yes"}`);
if (execute) console.log(`Supabase target: ${displaySupabaseTarget()}`);
for (const warning of artifact.warnings) console.warn(`WARN: ${warning}`);

const result = await importManifest({
  id,
  execute,
  target,
  productionConfirmed,
});
if (result.dryRun) {
  console.log("DRY RUN COMPLETE: no database write, publish, translation, credit, or allowance action occurred.");
} else {
  console.log(`Draft series id: ${result.seriesId}`);
  console.log(`Draft episodes inserted: ${result.episodeCount}`);
  console.log(`Source hash: ${result.sourceHash}`);
  console.log("IMPORT COMPLETE: Draft only. Preview and manual publish are still required.");
}

}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
