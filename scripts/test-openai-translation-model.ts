import assert from "node:assert/strict";
import {
  DEFAULT_TRANSLATION_MODEL,
  DEFAULT_WORD_EXPLANATION_MODEL,
  getDefaultTextTokenPricesUsd,
  getTranslationReasoning,
} from "../src/lib/translation/openAITranslationModel";

// Characterization test: pins current behavior only (LT-002).

assert.equal(DEFAULT_TRANSLATION_MODEL, "gpt-5.4-mini");
assert.equal(DEFAULT_WORD_EXPLANATION_MODEL, "gpt-5.6-luna");

assert.deepEqual(getDefaultTextTokenPricesUsd("gpt-5.4-mini"), { inputPer1mTokens: 0.75, outputPer1mTokens: 4.5 });
assert.deepEqual(getDefaultTextTokenPricesUsd("gpt-5.6-luna"), { inputPer1mTokens: 0.2, outputPer1mTokens: 1.2 });
assert.deepEqual(getDefaultTextTokenPricesUsd("gpt-5.6-terra"), { inputPer1mTokens: 2, outputPer1mTokens: 12 });
assert.deepEqual(getDefaultTextTokenPricesUsd("gpt-5-mini"), { inputPer1mTokens: 0.25, outputPer1mTokens: 2 });
assert.deepEqual(getDefaultTextTokenPricesUsd("gpt-4.1-mini"), { inputPer1mTokens: 0.4, outputPer1mTokens: 1.6 });
// KD-13: an unknown model is estimated at the highest listed prices (never lower).
const conservative = { inputPer1mTokens: 2, outputPer1mTokens: 12 };
assert.deepEqual(getDefaultTextTokenPricesUsd("some-unknown-model"), conservative);
assert.deepEqual(getDefaultTextTokenPricesUsd(""), conservative);
// Inherited object keys are not table entries.
assert.deepEqual(getDefaultTextTokenPricesUsd("constructor"), conservative);
assert.deepEqual(getDefaultTextTokenPricesUsd("toString"), conservative);
assert.deepEqual(getDefaultTextTokenPricesUsd("__proto__"), conservative);
// Callers cannot change the table through the returned object.
const copy = getDefaultTextTokenPricesUsd("gpt-5.4-mini");
copy.inputPer1mTokens = 0;
assert.deepEqual(getDefaultTextTokenPricesUsd("gpt-5.4-mini"), { inputPer1mTokens: 0.75, outputPer1mTokens: 4.5 });
const unknownCopy = getDefaultTextTokenPricesUsd("unknown-a");
unknownCopy.outputPer1mTokens = 0;
assert.deepEqual(getDefaultTextTokenPricesUsd("unknown-b"), conservative);

assert.deepEqual(getTranslationReasoning("gpt-5.4"), { effort: "low" });
assert.deepEqual(getTranslationReasoning("gpt-5.4-mini"), { effort: "low" });
assert.deepEqual(getTranslationReasoning("gpt-5.5"), { effort: "none" });
assert.deepEqual(getTranslationReasoning("gpt-5.6-luna"), { effort: "none" });
assert.deepEqual(getTranslationReasoning("gpt-5-mini"), { effort: "minimal" });
assert.deepEqual(getTranslationReasoning("gpt-5.40"), { effort: "minimal" });
assert.equal(getTranslationReasoning("gpt-4.1-mini"), undefined);
assert.equal(getTranslationReasoning(""), undefined);

console.log("PASS: OpenAI translation model defaults, token prices and reasoning effort");
