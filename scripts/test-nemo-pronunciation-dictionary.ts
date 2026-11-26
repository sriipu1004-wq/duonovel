import assert from "node:assert/strict";
import { resolveNemoPronunciationDictionary } from "../src/lib/recording/nemoPronunciationDictionary";

// Characterization test: pins current behavior only (LT-002).

const globalOnly = {
  "LIB read": "ライブリード",
  "VOICEVOX Nemo": "ボイスボックス ニモ",
};

assert.deepEqual(resolveNemoPronunciationDictionary({}), globalOnly);
assert.deepEqual(
  resolveNemoPronunciationDictionary({ seriesId: "unknown-series", episodeId: "unknown-episode" }),
  globalOnly
);
assert.deepEqual(resolveNemoPronunciationDictionary({ seriesId: "", episodeId: "" }), globalOnly);

// Prototype-like ids do not add entries (no per-series/episode dictionaries are registered today).
for (const id of ["__proto__", "toString", "constructor"]) {
  assert.deepEqual(resolveNemoPronunciationDictionary({ seriesId: id, episodeId: id }), globalOnly, id);
}

// Returns a fresh object each call.
const first = resolveNemoPronunciationDictionary({});
first["LIB read"] = "changed";
assert.equal(resolveNemoPronunciationDictionary({})["LIB read"], "ライブリード");

console.log("PASS: Nemo pronunciation dictionary (global entries, unknown ids, fresh object)");
