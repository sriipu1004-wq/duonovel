import assert from "node:assert/strict";
import { decideNemoRegenerationByBody } from "../src/lib/recording/nemoRegenerationDiff";

// Characterization test: pins current behavior only (LT-002).

function decide(previousBody: string, nextBody: string) {
  return decideNemoRegenerationByBody({ previousBody, nextBody });
}

// Identical raw bodies: no_change, comparable text still computed.
assert.deepEqual(decide("吾輩は猫である。", "吾輩は猫である。"), {
  shouldRegenerate: false,
  reason: "no_change",
  previousComparableText: "吾輩は猫である。",
  nextComparableText: "吾輩は猫である。",
});
assert.deepEqual(decide("", ""), {
  shouldRegenerate: false,
  reason: "no_change",
  previousComparableText: "",
  nextComparableText: "",
});

// Formatting-only differences do not regenerate.
for (const [previous, next] of [
  ["吾輩は猫である。", "吾輩は猫である。\n\n"],
  ["吾輩は猫である。", "  吾輩は猫である。  "],
  ["吾輩は猫である。\n\n\n\n名前", "吾輩は猫である。\n\n名前"],
  ["\r\nあ\r\n", "\nあ\n"],
] as const) {
  const result = decide(previous, next);
  assert.equal(result.shouldRegenerate, false, JSON.stringify([previous, next]));
  assert.equal(result.reason, "format_only", JSON.stringify([previous, next]));
  assert.equal(result.previousComparableText, result.nextComparableText);
}
assert.equal(
  decide("吾輩は猫である。\n\n\n\n名前", "吾輩は猫である。\n\n名前").nextComparableText,
  "吾輩は猫である。\n\n名前"
);

// Spoken text changes regenerate.
assert.deepEqual(decide("A", "B"), {
  shouldRegenerate: true,
  reason: "body_spoken_changed",
  previousComparableText: "A",
  nextComparableText: "B",
});
assert.equal(decide("", "x").reason, "body_spoken_changed");

// Current behavior: "..." is normalized to "……" while a single "…" stays,
// so this pair counts as a spoken change.
const ellipsis = decide("猫…", "猫...");
assert.equal(ellipsis.reason, "body_spoken_changed");
assert.equal(ellipsis.previousComparableText, "猫…");
assert.equal(ellipsis.nextComparableText, "猫……");

console.log("PASS: Nemo regeneration diff (no_change, format_only, body_spoken_changed)");
