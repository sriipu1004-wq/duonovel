import assert from "node:assert/strict";
import {
  buildReaderAuthorHref,
  getCanonicalAivisReaderKey,
  getCanonicalNemoReaderKey,
  getReaderNameFromSyntheticAuthorId,
  isAivisReaderName,
  isNemoReaderName,
} from "../src/lib/readerAuthorHref";

// Characterization test: pins current behavior only (LT-002).

assert.equal(isNemoReaderName("VOICEVOX Nemo 女声1"), true);
assert.equal(isNemoReaderName("voicevox nemo"), false);
assert.equal(isNemoReaderName(" VOICEVOX Nemo"), false);
assert.equal(isAivisReaderName("Aivis まお"), true);
assert.equal(isAivisReaderName("Aivis"), false);

assert.equal(getCanonicalNemoReaderKey("VOICEVOX Nemo A"), "nemo:VOICEVOX Nemo A");
assert.equal(getCanonicalAivisReaderKey("Aivis B"), "aivis:Aivis B");

assert.equal(getReaderNameFromSyntheticAuthorId("nemo:VOICEVOX Nemo A"), "VOICEVOX Nemo A");
assert.equal(getReaderNameFromSyntheticAuthorId("aivis:Aivis B"), "Aivis B");
assert.equal(getReaderNameFromSyntheticAuthorId("user-uuid"), "");
assert.equal(getReaderNameFromSyntheticAuthorId(""), "");

// Nothing usable -> root.
assert.equal(buildReaderAuthorHref(), "/");
assert.equal(buildReaderAuthorHref("", "   "), "/");
assert.equal(buildReaderAuthorHref(42, null), "/");

// Plain key without name: no query string, key trimmed and encoded.
assert.equal(buildReaderAuthorHref("  user-1  "), "/authors/user-1");
assert.equal(buildReaderAuthorHref("a/b c"), "/authors/a%2Fb%20c");

// Ordinary reader name: key wins over name for the path, name goes to query.
assert.equal(
  buildReaderAuthorHref("user-1", " 山田 "),
  `/authors/user-1?readerName=${new URLSearchParams({ x: "山田" }).toString().slice(2)}`
);

// Name only (non-synthetic): name is used as the key.
assert.equal(buildReaderAuthorHref(undefined, "Reader"), "/authors/Reader?readerName=Reader");

// Synthetic Nemo / Aivis names override any provided key.
assert.equal(
  buildReaderAuthorHref("ignored-key", "VOICEVOX Nemo A"),
  "/authors/nemo%3AVOICEVOX%20Nemo%20A?readerName=VOICEVOX+Nemo+A"
);
assert.equal(
  buildReaderAuthorHref("ignored-key", "Aivis B"),
  "/authors/aivis%3AAivis%20B?readerName=Aivis+B"
);

console.log("PASS: reader author href (synthetic Nemo/Aivis keys, fallbacks, encoding)");
