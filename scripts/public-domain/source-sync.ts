import {
  existsSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { unzipSync } from "fflate";
import { isAllowedAozoraTextUrl } from "./aozora";
import { sha256Bytes } from "./core";
import {
  loadManifest,
  manifestPathForId,
  prepareManifest,
} from "./runtime";

function sleep(ms: number) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

async function main() {
const args = process.argv.slice(2);
const force = args.includes("--force");
const prepare = args.includes("--prepare");
const allPending = args.includes("--all-pending");
const limitRaw = args.find((arg) => arg.startsWith("--limit="))?.slice("--limit=".length);
const delayRaw = args.find((arg) => arg.startsWith("--delay-ms="))?.slice("--delay-ms=".length);
const limit = limitRaw ? Number(limitRaw) : 10;
const delayMs = delayRaw ? Number(delayRaw) : 750;
if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
  throw new Error("--limit must be an integer from 1 to 50");
}
if (!Number.isInteger(delayMs) || delayMs < 250 || delayMs > 10_000) {
  throw new Error("--delay-ms must be an integer from 250 to 10000");
}

const explicitIds = args.filter((arg) => !arg.startsWith("--"));
let ids = explicitIds;
if (allPending) {
  const dir = resolve(process.cwd(), "public-domain/manifests");
  ids = readdirSync(dir)
    .filter((name) => name.endsWith(".json") && !name.startsWith("_"))
    .map((name) => name.slice(0, -5))
    .filter((id) => {
      try {
        const manifest = loadManifest(id);
        return manifest.source_provider === "Aozora Bunko" && !existsSync(resolve(process.cwd(), manifest.source_file));
      } catch {
        return false;
      }
    });
}
ids = Array.from(new Set(ids)).slice(0, limit);
if (ids.length === 0) {
  throw new Error("Provide manifest ids or --all-pending");
}

console.log(`Aozora source sync count: ${ids.length}`);
console.log("Fetcher allowlist: https://www.aozora.gr.jp/cards/.../files/*.zip only");
console.log(`Rate delay: ${delayMs}ms; prepare=${prepare}; force=${force}`);

let completed = 0;
for (const [index, id] of ids.entries()) {
  const manifest = loadManifest(id);
  if (manifest.source_provider !== "Aozora Bunko") {
    throw new Error(`${id}: source_provider must be Aozora Bunko`);
  }

  const manifestPath = manifestPathForId(id);
  const rawManifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
  const downloadUrl = manifest.source_download_url;
  if (!downloadUrl || !isAllowedAozoraTextUrl(downloadUrl)) {
    throw new Error(`${id}: source_download_url is missing or not allowlisted`);
  }

  const outputPath = resolve(process.cwd(), manifest.source_file);
  if (existsSync(outputPath) && !force) {
    console.log(`SKIP ${id}: raw source already exists`);
    if (prepare) prepareManifest(id);
    completed += 1;
    continue;
  }

  if (index > 0) await sleep(delayMs);
  const response = await fetch(downloadUrl, {
    redirect: "error",
    headers: {
      "user-agent": "LIB-read-Public-Domain-Operator/1.0 (+https://www.syosetu-libread.com)",
    },
  });
  if (!response.ok) {
    throw new Error(`${id}: source fetch failed with HTTP ${response.status}`);
  }
  const zipBytes = new Uint8Array(await response.arrayBuffer());
  if (zipBytes.byteLength > 25_000_000) {
    throw new Error(`${id}: source ZIP exceeds 25 MB safety limit`);
  }
  const archive = unzipSync(zipBytes);
  const textEntries = Object.entries(archive).filter(([name]) =>
    /(?:^|\/)\w[^/]*\.txt$/iu.test(name)
  );
  if (textEntries.length !== 1) {
    throw new Error(
      `${id}: expected exactly one TXT entry in Aozora ZIP, found ${textEntries.length}`
    );
  }
  const sourceBytes = textEntries[0]![1];
  if (sourceBytes.byteLength === 0 || sourceBytes.byteLength > 20_000_000) {
    throw new Error(`${id}: extracted source size is invalid`);
  }
  const hash = sha256Bytes(sourceBytes);
  if (
    manifest.approved &&
    manifest.source_hash &&
    manifest.source_hash !== hash
  ) {
    throw new Error(
      `${id}: approved manifest source_hash differs from fetched source; manual re-review required`
    );
  }

  writeFileSync(outputPath, sourceBytes);
  rawManifest.source_retrieved_at = new Date().toISOString();
  rawManifest.source_hash = hash;
  writeFileSync(manifestPath, `${JSON.stringify(rawManifest, null, 2)}\n`, "utf8");
  console.log(
    `SYNCED ${id}: ${sourceBytes.byteLength} bytes sha256=${hash.slice(0, 16)}...`
  );
  if (prepare) {
    const artifact = prepareManifest(id);
    console.log(
      `PREPARED ${id}: chapters=${artifact.chapters.length} chars=${artifact.displayCharacterCount}`
    );
  }
  completed += 1;
}
console.log(`Aozora source sync complete: ${completed}/${ids.length}`);
console.log("No rights approval, database write, publication, or translation was performed.");

}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
