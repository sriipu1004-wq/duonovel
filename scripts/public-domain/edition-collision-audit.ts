import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { unzipSync } from "fflate";
import {
  AOZORA_CATALOG_URL,
  parseCsv,
} from "./aozora";
import {
  auditAozoraEditionCollisions,
  type AozoraEditionSelectedManifest,
} from "./aozora-edition-collisions";

const DEFAULT_SOURCE_MANIFEST_IDS = [
  "aozora-000022", "aozora-000195", "aozora-000198", "aozora-000204",
  "aozora-000321", "aozora-057848", "aozora-053520", "aozora-000692",
  "aozora-004386", "aozora-033200",
];

async function catalogBytes(args: string[]): Promise<Uint8Array> {
  const local = args.find(x => x.startsWith("--catalog="))?.slice(10);
  if (local) return new Uint8Array(readFileSync(local));
  if (!args.includes("--fetch-catalog")) {
    throw new Error("Pass --catalog=<official_catalog_zip> or --fetch-catalog (one official catalog download)");
  }
  const response = await fetch(AOZORA_CATALOG_URL, {
    redirect: "error",
    headers: { "user-agent": "LIB-read-Public-Domain-Operator/1.0 (+https://www.syosetu-libread.com)" },
  });
  if (!response.ok) throw new Error("Official Aozora catalog fetch HTTP " + response.status);
  const data = new Uint8Array(await response.arrayBuffer());
  return data;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const unknown = args.filter(x => !x.startsWith("--catalog=") && !x.startsWith("--ids=") && x !== "--fetch-catalog");
  if (unknown.length > 0 || (args.some(x => x.startsWith("--catalog=")) && args.includes("--fetch-catalog"))) {
    throw new Error("Unexpected flags or conflicting --catalog/--fetch-catalog");
  }
  const rawIds = args.find(x => x.startsWith("--ids="))?.slice(6);
  const selectedIds = rawIds ? rawIds.split(",").filter(Boolean) : DEFAULT_SOURCE_MANIFEST_IDS;
  if (selectedIds.length < 1 || selectedIds.length > 60 || new Set(selectedIds).size !== selectedIds.length) {
    throw new Error("Select 1–60 unique source manifest IDs");
  }
  const bytes = await catalogBytes(args);
  if (bytes.length > 20_000_000) throw new Error("Aozora catalog ZIP > 20 MB");
  const archive = unzipSync(bytes);
  const entry = Object.entries(archive).find(([path]) => path.endsWith("list_person_all_extended_utf8.csv"));
  if (!entry || entry[1].length > 80_000_000) throw new Error("Expected Aozora CSV missing or oversized");
  const rows = parseCsv(new TextDecoder("utf-8", { fatal: true }).decode(entry[1]));
  const manifests = selectedIds.map(id => {
    if (!/^aozora-[0-9]{6}$/u.test(id)) throw new Error("Invalid source ID");
    const m = JSON.parse(readFileSync("public-domain/manifests/" + id + ".json", "utf8")) as AozoraEditionSelectedManifest;
    if (m.id !== id) throw new Error("Manifest path/id disagreement for " + id);
    return m;
  });
  const results = auditAozoraEditionCollisions(rows, manifests);
  const missing = results.filter(x => x.status === "SOURCE_CARD_MISMATCH");
  console.log(JSON.stringify({
    scope: "official Aozora catalog metadata; not text or copyright clearance",
    source: AOZORA_CATALOG_URL,
    catalogZipSha256: createHash("sha256").update(bytes).digest("hex"),
    catalogRows: rows.length,
    selected: results.length,
    sourceCardMismatches: missing.length,
    sameAuthorVariantCases: results.filter(x => x.status === "SAME_AUTHOR_MULTIPLE_EDITIONS").length,
    sameTitleOtherAuthorCases: results.filter(x => x.status === "SAME_TITLE_OTHER_AUTHOR").length,
    noRightsClearance: true,
    results,
  }, null, 2));
  if (missing.length > 0) process.exitCode = 2;
}

main().catch(e => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
});
