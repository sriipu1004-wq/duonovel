import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  OG_SUBSET_FONT_CODE_POINT_COUNT,
  OG_SUBSET_FONT_RANGES,
} from "../src/lib/og/ogFontCoverage.generated";

// Characterization test: pins current behavior only (LT-002).
// The generated range table must equal the union of the character maps (cmap) of the
// bundled subset fonts in src/assets/og-fonts, read here with a small cmap parser
// (formats 4 and 12). The fonts are local files; nothing is downloaded.

function readCmap(path: string): Set<number> {
  const font = readFileSync(path);
  const view = new DataView(font.buffer, font.byteOffset, font.byteLength);
  const numTables = view.getUint16(4);
  let cmapOffset = -1;
  for (let i = 0; i < numTables; i += 1) {
    const record = 12 + i * 16;
    if (font.toString("latin1", record, record + 4) === "cmap") cmapOffset = view.getUint32(record + 8);
  }
  assert.ok(cmapOffset >= 0, `${path}: no cmap`);
  const subtables: Array<{ platform: number; encoding: number; offset: number; format: number }> = [];
  for (let i = 0; i < view.getUint16(cmapOffset + 2); i += 1) {
    const record = cmapOffset + 4 + i * 8;
    const offset = cmapOffset + view.getUint32(record + 4);
    subtables.push({ platform: view.getUint16(record), encoding: view.getUint16(record + 2), offset, format: view.getUint16(offset) });
  }
  // Same preference order as fontTools' getBestCmap (only the formats used here).
  const preference = [[3, 10], [0, 6], [0, 4], [3, 1], [0, 3], [0, 2], [0, 1], [0, 0]];
  const best = preference
    .map(([platform, encoding]) => subtables.find((s) => s.platform === platform && s.encoding === encoding))
    .find((s) => s && (s.format === 4 || s.format === 12));
  assert.ok(best, `${path}: no Unicode cmap`);

  const codePoints = new Set<number>();
  const o = best.offset;
  if (best.format === 12) {
    const groups = view.getUint32(o + 12);
    for (let i = 0; i < groups; i += 1) {
      const g = o + 16 + i * 12;
      const start = view.getUint32(g);
      const end = view.getUint32(g + 4);
      const startGlyph = view.getUint32(g + 8);
      for (let cp = start; cp <= end; cp += 1) if (startGlyph + (cp - start) !== 0) codePoints.add(cp);
    }
    return codePoints;
  }
  const segX2 = view.getUint16(o + 6);
  const ends = o + 14;
  const starts = ends + segX2 + 2;
  const deltas = starts + segX2;
  const rangeOffsets = deltas + segX2;
  for (let i = 0; i < segX2 / 2; i += 1) {
    const end = view.getUint16(ends + i * 2);
    const start = view.getUint16(starts + i * 2);
    const delta = view.getInt16(deltas + i * 2);
    const rangeOffset = view.getUint16(rangeOffsets + i * 2);
    for (let cp = start; cp <= end; cp += 1) {
      if (cp === 0xffff) continue;
      let glyph: number;
      if (rangeOffset === 0) {
        glyph = (cp + delta) & 0xffff;
      } else {
        const address = rangeOffsets + i * 2 + rangeOffset + (cp - start) * 2;
        glyph = view.getUint16(address);
        if (glyph !== 0) glyph = (glyph + delta) & 0xffff;
      }
      if (glyph !== 0) codePoints.add(cp);
    }
  }
  return codePoints;
}

const fontDir = join(__dirname, "..", "src", "assets", "og-fonts");
const cover = (name: string) => readCmap(join(fontDir, name));
const jp400 = cover("NotoSansJP-OgSubset-400.ttf");
const jp700 = cover("NotoSansJP-OgSubset-700.ttf");
const kr400 = cover("NotoSansKR-OgSubset-400.ttf");
const kr700 = cover("NotoSansKR-OgSubset-700.ttf");
// Both weights of one family cover the same characters.
assert.deepEqual([...jp400].sort((a, b) => a - b), [...jp700].sort((a, b) => a - b));
assert.deepEqual([...kr400].sort((a, b) => a - b), [...kr700].sort((a, b) => a - b));
const union = new Set([...jp400, ...kr400]);

// Range table: sorted, inclusive, non-overlapping and maximal (adjacent ranges merged).
const fromTable = new Set<number>();
let previousEnd = -2;
for (const [start, end] of OG_SUBSET_FONT_RANGES) {
  assert.ok(Number.isInteger(start) && Number.isInteger(end) && start <= end, `${start}-${end}`);
  assert.ok(start > previousEnd + 1, `range 0x${start.toString(16)} is not merged with the previous one`);
  for (let cp = start; cp <= end; cp += 1) fromTable.add(cp);
  previousEnd = end;
}
assert.equal(fromTable.size, OG_SUBSET_FONT_CODE_POINT_COUNT);
assert.equal(union.size, OG_SUBSET_FONT_CODE_POINT_COUNT);
assert.deepEqual([...fromTable].filter((cp) => !union.has(cp)), [], "in the table but not in the fonts");
assert.deepEqual([...union].filter((cp) => !fromTable.has(cp)), [], "in the fonts but not in the table");

// Spot checks.
for (const ch of ["A", "~", "あ", "ア", "日", "本", "한", "国", "「", "」", "…"]) {
  assert.ok(fromTable.has(ch.codePointAt(0)!), `${ch} should be covered`);
}
assert.equal(fromTable.has(0x7f), false);

console.log(`ogFontCoverage.generated characterization: PASS (${OG_SUBSET_FONT_CODE_POINT_COUNT} code points)`);
