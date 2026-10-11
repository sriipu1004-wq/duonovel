import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const path = "src/app/locale-work/[seriesId]/page.tsx";
const source = readFileSync(path, "utf8");
const metadataStart = source.indexOf("export async function generateMetadata(");
const pageStart = source.indexOf("export default async function LocaleWorkPage(");
assert.ok(metadataStart >= 0 && pageStart > metadataStart, "Separate locale metadata and canonical Work page");
const metadata = source.slice(metadataStart, pageStart);

assert.ok(metadata.includes("if (!isUuid(seriesId))"), "Reject invalid IDs before fetching public catalog");
assert.ok(metadata.includes("getCachedPublicBaseWorkCards({"), "Successful metadata must keep existing canonical catalog");
assert.ok(metadata.includes("ignoreContentLanguageFilter: true"), "Preserve locale-independent canonical description");
assert.ok(metadata.includes("prioritizeForUiLocale: false"), "Preserve full-catalog canonical source semantics");
assert.ok(metadata.includes("works.find((item) => item.seriesId === seriesId)"));
assert.ok(metadata.includes("} catch {"), "Catalog timeout must be handled within generateMetadata");
const catchStart = metadata.indexOf("} catch {");
assert.ok(catchStart > metadata.indexOf("getCachedPublicBaseWorkCards({"));
const catchBody = metadata.slice(catchStart);
assert.ok(catchBody.includes('title: "LIB read"'), "Unavailable metadata must have generic title");
assert.ok(catchBody.includes("robots: { index: false, follow: false }"), "Unknown visibility must remain noindex");
assert.equal(catchBody.includes("return { title: work.title"), false);
assert.ok(metadata.includes("if (!work)"), "Existing absent-or-hidden fallback remains");
assert.ok(metadata.includes("robots: { index: true, follow: true }"), "Successful metadata remains indexable");
assert.ok(source.includes("<WorkPage {...props} />"), "Do not replace canonical Work's own access gate");
console.log("PASS: locale-work metadata cache failures are generic/noindex, healthy SEO semantics and Work/R18 gates preserved");
