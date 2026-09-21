import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { unzipSync } from "fflate";
import {
  AOZORA_CATALOG_URL,
  canonicalAozoraIdentityPart,
  classifyAozoraWork,
  groupAozoraRows,
  makePendingAozoraManifest,
  parseCsv,
} from "./aozora";

async function main() {
const args = process.argv.slice(2);
const write = args.includes("--write");
const includeExisting = args.includes("--include-existing");
const limitRaw = args.find((arg) => arg.startsWith("--limit="))?.slice("--limit=".length);
const authorFilter = args.find((arg) => arg.startsWith("--author="))?.slice("--author=".length)?.trim();
const minCharsRaw = args.find((arg) => arg.startsWith("--min-chars="))?.slice("--min-chars=".length);
const perAuthorRaw = args
  .find((arg) => arg.startsWith("--per-author-limit="))
  ?.slice("--per-author-limit=".length);
const limit = limitRaw ? Number(limitRaw) : 25;
const minChars = minCharsRaw ? Number(minCharsRaw) : 1000;
const perAuthorLimit = perAuthorRaw ? Number(perAuthorRaw) : 5;
if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
  throw new Error("--limit must be an integer from 1 to 100");
}
if (!Number.isInteger(minChars) || minChars < 0) {
  throw new Error("--min-chars must be a non-negative integer");
}
if (!Number.isInteger(perAuthorLimit) || perAuthorLimit < 1 || perAuthorLimit > 100) {
  throw new Error("--per-author-limit must be an integer from 1 to 100");
}

const response = await fetch(AOZORA_CATALOG_URL, {
  redirect: "error",
  headers: {
    "user-agent": "LIB-read-Public-Domain-Operator/1.0 (+https://www.syosetu-libread.com)",
  },
});
if (!response.ok) {
  throw new Error(`Aozora catalog fetch failed: HTTP ${response.status}`);
}
const bytes = new Uint8Array(await response.arrayBuffer());
if (bytes.byteLength > 20_000_000) {
  throw new Error("Aozora catalog ZIP exceeds 20 MB safety limit");
}
const archive = unzipSync(bytes);
const csvEntry = Object.entries(archive).find(([name]) =>
  name.endsWith("list_person_all_extended_utf8.csv")
);
if (!csvEntry) throw new Error("Aozora catalog CSV was not found in ZIP");
const rows = parseCsv(new TextDecoder("utf-8", { fatal: true }).decode(csvEntry[1]));
const grouped = groupAozoraRows(rows);

const manifestDir = resolve(process.cwd(), "public-domain/manifests");
const existingManifestIds = new Set(
  existsSync(manifestDir)
    ? (await import("node:fs")).readdirSync(manifestDir)
        .filter((name) => name.endsWith(".json") && !name.startsWith("_"))
        .map((name) => name.slice(0, -5))
    : []
);
const existingAuditPath = resolve(
  process.cwd(),
  "public-domain/audits/official-production-2026-09-22.json"
);
const existingTitles = new Set<string>();
if (!includeExisting && existsSync(existingAuditPath)) {
  const audit = JSON.parse(
    await import("node:fs").then(({ readFileSync }) =>
      readFileSync(existingAuditPath, "utf8")
    )
  ) as {
    series?: Array<{ title?: string }>;
    contained_titles?: string[];
    known_title_aliases?: string[];
  };
  for (const row of audit.series ?? []) {
    const title = row.title?.trim();
    if (!title) continue;
    existingTitles.add(canonicalAozoraIdentityPart(title));
    const base = title.includes("・") ? title.split("・")[0]!.trim() : title;
    if (base) existingTitles.add(canonicalAozoraIdentityPart(base));
  }
  for (const title of [
    ...(audit.contained_titles ?? []),
    ...(audit.known_title_aliases ?? []),
  ]) {
    if (title.trim()) existingTitles.add(canonicalAozoraIdentityPart(title.trim()));
  }
}

const classifications = Array.from(grouped.values()).map((sourceRows) =>
  classifyAozoraWork(sourceRows)
);
const rejectionCounts = new Map<string, number>();
for (const item of classifications) {
  for (const reason of item.reasons) {
    rejectionCounts.set(reason, (rejectionCounts.get(reason) ?? 0) + 1);
  }
}

const classified = classifications
  .filter((item) => item.eligible)
  .filter((item) => !authorFilter || item.author.includes(authorFilter))
  .filter((item) => {
    const raw = item.sourceRows[0]?.["文字数"]?.replace(/,/gu, "").trim() ?? "";
    if (!raw) return true;
    const charCount = Number(raw);
    return !Number.isFinite(charCount) || charCount >= minChars;
  })
  .filter((item) => {
    if (includeExisting) return true;
    return !existingTitles.has(canonicalAozoraIdentityPart(item.title));
  })
  .sort((a, b) => {
    const styleRank = (item: typeof a) => {
      const style = item.sourceRows[0]?.["文字遣い種別"]?.trim();
      if (style === "新字新仮名") return 0;
      if (style === "新字旧仮名") return 1;
      return 2;
    };
    return styleRank(a) - styleRank(b) || a.workId.localeCompare(b.workId);
  });

const uniqueByWork = new Map<string, (typeof classified)[number]>();
for (const item of classified) {
  const key = `${canonicalAozoraIdentityPart(item.title)}|${canonicalAozoraIdentityPart(item.author)}`;
  if (!uniqueByWork.has(key)) uniqueByWork.set(key, item);
}

const sortedCandidates = Array.from(uniqueByWork.values())
  .filter((item) => includeExisting || !existingManifestIds.has(`aozora-${item.workId}`))
  .sort((a, b) => {
    const accessA = Number(a.sourceRows[0]?.["累計アクセス数"]?.replace(/,/gu, "") || "0");
    const accessB = Number(b.sourceRows[0]?.["累計アクセス数"]?.replace(/,/gu, "") || "0");
    return accessB - accessA || a.workId.localeCompare(b.workId);
  });

const candidates: typeof sortedCandidates = [];
const authorCounts = new Map<string, number>();
for (const item of sortedCandidates) {
  const authorKey = canonicalAozoraIdentityPart(item.author);
  const count = authorCounts.get(authorKey) ?? 0;
  if (count >= perAuthorLimit) continue;
  candidates.push(item);
  authorCounts.set(authorKey, count + 1);
  if (candidates.length >= limit) break;
}

console.log(`Aozora catalog rows: ${rows.length}`);
console.log(`Eligible conservative candidates selected: ${candidates.length}`);
if (candidates.length === 0 || args.includes("--diagnose")) {
  console.log("Top rejection reasons:");
  for (const [reason, count] of Array.from(rejectionCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)) {
    console.log(`  ${count}: ${reason}`);
  }
}
console.log(
  `Criteria: copyright flags=なし, author-only contributors, death<=1955, first publication<=1930, allowlisted Aozora ZIP, per-author-limit=${perAuthorLimit}`
);
console.log("Rights state: pending only; this command never approves or imports.");

if (!write) {
  for (const item of candidates) {
    console.log(
      `DRY RUN aozora-${item.workId}: ${item.title} / ${item.author} / death=${item.authorDeathYear} / first=${item.firstPublicationYear}`
    );
  }
  console.log("No files written. Re-run with --write to create pending manifests.");
  process.exit(0);
}

const outputDir = manifestDir;
mkdirSync(outputDir, { recursive: true });
let created = 0;
let skipped = 0;
for (const item of candidates) {
  const manifest = makePendingAozoraManifest(item);
  const path = resolve(outputDir, `aozora-${item.workId}.json`);
  if (existsSync(path)) {
    console.log(`SKIP existing manifest: aozora-${item.workId}`);
    skipped += 1;
    continue;
  }
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(`CREATED pending manifest: aozora-${item.workId} ${item.title}`);
  created += 1;
}
console.log(`Candidate manifest generation complete: created=${created}, skipped=${skipped}`);
console.log("Next: rights review -> source sync -> prepare -> chapter review -> approve -> batch dry-run.");

}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
