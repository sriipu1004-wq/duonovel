import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import {
  importManifest,
  loadLocalEnvironment,
  loadManifest,
  prepareManifest,
} from "./runtime";

const args = process.argv.slice(2);
for (const forbidden of ["--publish", "--public", "--translate", "--author-id"]) {
  if (args.some((arg) => arg === forbidden || arg.startsWith(`${forbidden}=`))) {
    throw new Error(`Forbidden flag: ${forbidden}`);
  }
}

const execute = args.includes("--execute");
const allApproved = args.includes("--all-approved");
const prepare = args.includes("--prepare");
const continueOnError = args.includes("--continue-on-error");
const productionConfirmed = args.includes("--production");
const targetRaw = args
  .find((arg) => arg.startsWith("--target="))
  ?.slice("--target=".length);
const target =
  targetRaw === "local" || targetRaw === "preview" || targetRaw === "production"
    ? targetRaw
    : null;
if (targetRaw && !target) throw new Error(`Invalid --target: ${targetRaw}`);
if (execute && !target) {
  throw new Error("--execute requires --target=local, --target=preview, or --target=production");
}
if (target === "production" && !productionConfirmed) {
  throw new Error("Production batch execution requires --production");
}

const maxRaw = args.find((arg) => arg.startsWith("--max="))?.slice("--max=".length);
const max = maxRaw ? Number(maxRaw) : 25;
if (!Number.isInteger(max) || max < 1 || max > 100) {
  throw new Error("--max must be an integer from 1 to 100");
}

const explicitIds = args.filter((arg) => !arg.startsWith("--"));
let ids = explicitIds;
if (allApproved) {
  const dir = resolve(process.cwd(), "public-domain/manifests");
  ids = readdirSync(dir)
    .filter((name) => name.endsWith(".json") && !name.startsWith("_"))
    .map((name) => name.slice(0, -5))
    .filter((id) => {
      try {
        const manifest = loadManifest(id);
        return manifest.approved && manifest.rights_status === "approved" && manifest.import_status !== "imported";
      } catch {
        return false;
      }
    });
}
ids = Array.from(new Set(ids)).slice(0, max);
if (ids.length === 0) {
  throw new Error("Provide manifest ids or --all-approved");
}

if (execute) loadLocalEnvironment();

console.log(`Public Domain batch size: ${ids.length}`);
console.log(`Mode: ${execute ? "EXECUTE" : "DRY RUN"}`);
console.log(`Target: ${target ?? "none (dry run)"}`);
console.log(`Prepare first: ${prepare}`);
console.log("Publication state: private series + draft episodes only");
console.log("Translation/glossary/credit/allowance paths: disabled");

const results: Array<{
  id: string;
  status: "ok" | "failed";
  seriesId?: string | null;
  episodes?: number;
  error?: string;
}> = [];

for (const id of ids) {
  try {
    const manifest = loadManifest(id);
    if (!manifest.approved || manifest.rights_status !== "approved") {
      throw new Error("RIGHTS_NOT_APPROVED");
    }
    if (manifest.import_status === "imported") {
      throw new Error("ALREADY_IMPORTED");
    }
    if (prepare) {
      const prepared = prepareManifest(id);
      console.log(
        `PREPARED ${id}: chapters=${prepared.chapters.length} chars=${prepared.displayCharacterCount}`
      );
    }
    const result = await importManifest({
      id,
      execute,
      target,
      productionConfirmed,
    });
    results.push({
      id,
      status: "ok",
      seriesId: result.seriesId,
      episodes: result.episodeCount,
    });
    console.log(
      `${result.dryRun ? "DRY-RUN" : "IMPORTED"} ${id}: episodes=${result.episodeCount}${result.seriesId ? ` series=${result.seriesId}` : ""}`
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    results.push({ id, status: "failed", error: message });
    console.error(`FAILED ${id}: ${message}`);
    if (!continueOnError) break;
  }
}

const ok = results.filter((item) => item.status === "ok").length;
const failed = results.filter((item) => item.status === "failed").length;
console.log(`Batch complete: ok=${ok}, failed=${failed}, attempted=${results.length}`);
if (!execute) {
  console.log("DRY RUN COMPLETE: no database write, publish, translation, credit, or allowance action occurred.");
}
if (failed > 0) process.exitCode = 1;
