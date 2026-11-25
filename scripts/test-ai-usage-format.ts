import assert from "node:assert/strict";
import { AI_ACTION_TYPES, formatAiUsage, isAiUsageLimitReached } from "../src/lib/aiUsage/aiUsage";

// Characterization test: pins current behavior only (LT-002).

assert.deepEqual([...AI_ACTION_TYPES], ["library_import", "translation_generation", "word_explanation"]);

assert.equal(formatAiUsage(), "–/–");
assert.equal(formatAiUsage(null), "–/–");
assert.equal(formatAiUsage({ used: 1, limit: 3 }), "1/3");
assert.equal(formatAiUsage({ used: 0, limit: 0 }), "0/0");
assert.equal(formatAiUsage({ used: 5, limit: -1 }), "無制限");

assert.equal(isAiUsageLimitReached(), false);
assert.equal(isAiUsageLimitReached(null), false);
assert.equal(isAiUsageLimitReached({ used: 2, limit: 3 }), false);
assert.equal(isAiUsageLimitReached({ used: 3, limit: 3 }), true);
assert.equal(isAiUsageLimitReached({ used: 4, limit: 3 }), true);
assert.equal(isAiUsageLimitReached({ used: 0, limit: 0 }), true);
assert.equal(isAiUsageLimitReached({ used: 999, limit: -1 }), false);

console.log("PASS: AI usage display helpers (format, limit reached, unlimited)");
