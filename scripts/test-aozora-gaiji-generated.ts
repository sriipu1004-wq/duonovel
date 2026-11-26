import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AOZORA_GENERATED_GAIJI } from "../src/lib/aozora/aozoraGaijiGenerated";

// Characterization test: pins current behavior only (LT-002).
// The generated table must match scripts/aozora/gaiji-pairs.tsv and gaiji-equivalent.tsv
// under the rules of scripts/aozora/generate-gaiji-table.py. The JIS X 0213 decode itself
// is not re-done here (Node has no euc_jisx0213 decoder); a few known code points are pinned.

const root = join(__dirname, "..");
const pairs = new Map<string, Set<string>>();
for (const line of readFileSync(join(root, "scripts/aozora/gaiji-pairs.tsv"), "utf8").split(/\r?\n/)) {
  if (!line) continue;
  const [code, description, ...rest] = line.split("\t");
  assert.equal(rest.length, 0, `extra column: ${line}`);
  if (!pairs.has(code)) pairs.set(code, new Set());
  pairs.get(code)!.add(description);
}
const equivalent = new Set(
  readFileSync(join(root, "scripts/aozora/gaiji-equivalent.tsv"), "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
);

const codeKey = (code: string) => code.split("-").map(Number);
const compareCodes = (a: string, b: string) => {
  const [x, y] = [codeKey(a), codeKey(b)];
  for (let i = 0; i < 3; i += 1) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
};

const keys = Object.keys(AOZORA_GENERATED_GAIJI);
assert.ok(keys.length > 0);
// Keys are plane-row-cell codes in numeric order.
for (const key of keys) {
  assert.match(key, /^[12]-\d{1,2}-\d{1,2}$/);
  const [plane, row, cell] = codeKey(key);
  assert.ok(plane >= 1 && plane <= 2 && row >= 1 && row <= 94 && cell >= 1 && cell <= 94, key);
}
assert.deepEqual(keys, [...keys].sort(compareCodes));

// Every entry is one non-ASCII code point with the TSV's (sorted) descriptions.
const chars = new Set<string>();
for (const [code, entry] of Object.entries(AOZORA_GENERATED_GAIJI)) {
  const points = [...entry.char];
  assert.equal(points.length, 1, `${code} must be one code point`);
  assert.ok(entry.char.codePointAt(0)! >= 0x80, code);
  assert.notEqual(entry.char, "�", code);
  assert.ok(pairs.has(code), `${code} is not in gaiji-pairs.tsv`);
  assert.deepEqual([...entry.descriptions], [...pairs.get(code)!].sort(), code);
  assert.ok(entry.descriptions.every((d) => d.length > 0), code);
  chars.add(entry.char);
}
assert.equal(chars.size, keys.length, "two codes map to the same character");

// Codes with several descriptions are in the table only when reviewed as equivalent;
// a code missing from the table is one of those unresolved conflicts or a failed decode.
for (const [code, descriptions] of pairs) {
  if (descriptions.size > 1 && !equivalent.has(code)) {
    assert.equal(code in AOZORA_GENERATED_GAIJI, false, `${code} has conflicting descriptions`);
  }
}
for (const code of equivalent) {
  if (pairs.has(code)) assert.ok(code in AOZORA_GENERATED_GAIJI, `reviewed code ${code} is missing`);
}
// As generated today, nothing in the TSV was skipped.
assert.deepEqual([...pairs.keys()].filter((code) => !(code in AOZORA_GENERATED_GAIJI)), []);

// Spot checks (from the generated file).
assert.deepEqual(AOZORA_GENERATED_GAIJI["1-2-22"], { descriptions: ["二の字点"], char: "〻" });
assert.deepEqual(AOZORA_GENERATED_GAIJI["1-8-78"], { descriptions: ["感嘆符疑問符"], char: "⁉" });
assert.deepEqual(AOZORA_GENERATED_GAIJI["1-13-21"], { descriptions: ["ローマ数字1"], char: "Ⅰ" });

console.log(`aozoraGaijiGenerated characterization: PASS (${keys.length} entries)`);
