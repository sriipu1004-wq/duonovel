import assert from "node:assert/strict";
import { strToU8, zipSync } from "fflate";
import { findZipEntry, readSafeZipTextEntries, resolveZipPath } from "../src/lib/library/zipBook";

// Characterization test: pins current behavior only (LT-002). Synthetic archives only.

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

// resolveZipPath
assert.equal(resolveZipPath("OEBPS/content.opf", "Text/ch1.xhtml"), "OEBPS/Text/ch1.xhtml");
assert.equal(resolveZipPath("OEBPS/Text/ch1.xhtml", "../Images/a.png#frag"), "OEBPS/Images/a.png");
assert.equal(resolveZipPath("OEBPS/Text/ch1.xhtml", "ch2.xhtml?x=1"), "OEBPS/Text/ch2.xhtml");
assert.equal(resolveZipPath("content.opf", "ch%201.xhtml"), "ch 1.xhtml");
assert.equal(resolveZipPath("a/b.opf", "/root.xhtml"), "root.xhtml");
// Climbing above the archive root is clamped to the root.
assert.equal(resolveZipPath("a/b.opf", "../../../etc/passwd"), "etc/passwd");
// Malformed percent-encoding falls back to plain normalization.
assert.equal(resolveZipPath("a/b.opf", "x%zz.xhtml"), "a/x%zz.xhtml");

// readSafeZipTextEntries keeps only text-like entries and normalizes names.
const archive = zipSync({
  mimetype: strToU8("application/epub+zip"),
  "META-INF/container.xml": strToU8("<container/>"),
  "OEBPS/content.opf": strToU8("<package/>"),
  "OEBPS/Text/ch1.xhtml": strToU8("<p>本文</p>"),
  "OEBPS/Images/cover.png": new Uint8Array([1, 2, 3]),
  "notes.TXT": strToU8("memo"),
});
const entries = readSafeZipTextEntries(toArrayBuffer(archive));
assert.deepEqual([...entries.keys()].sort(), [
  "META-INF/container.xml",
  "OEBPS/Text/ch1.xhtml",
  "OEBPS/content.opf",
  "mimetype",
  "notes.TXT",
]);
assert.equal(entries.get("OEBPS/Text/ch1.xhtml"), "<p>本文</p>");

// findZipEntry: exact, normalized, then case-insensitive.
assert.equal(findZipEntry(entries, "OEBPS/content.opf"), "<package/>");
assert.equal(findZipEntry(entries, "./OEBPS//Text/../content.opf"), "<package/>");
assert.equal(findZipEntry(entries, "oebps/CONTENT.OPF"), "<package/>");
assert.equal(findZipEntry(entries, "missing.xhtml"), null);

// Rejections.
assert.throws(() => readSafeZipTextEntries(new ArrayBuffer(10)), /ZIPファイルが壊れています/);
assert.throws(() => readSafeZipTextEntries(toArrayBuffer(new Uint8Array(100))), /ZIPファイルの目次を確認できませんでした/);
const emptyArchive = zipSync({});
assert.throws(() => readSafeZipTextEntries(toArrayBuffer(emptyArchive)), /項目数が多すぎます/);

// Encrypted flag in the central directory is rejected.
const flagged = zipSync({ "a.txt": strToU8("x") });
const view = new DataView(flagged.buffer, flagged.byteOffset, flagged.byteLength);
let central = -1;
for (let offset = 0; offset + 4 <= flagged.byteLength; offset += 1) {
  if (view.getUint32(offset, true) === 0x02014b50) {
    central = offset;
    break;
  }
}
assert.ok(central >= 0);
view.setUint16(central + 8, view.getUint16(central + 8, true) | 0x1, true);
assert.throws(() => readSafeZipTextEntries(toArrayBuffer(flagged)), /暗号化/);

console.log("PASS: zip book helpers (path resolution, safe text-entry extraction, lookup, rejections)");
