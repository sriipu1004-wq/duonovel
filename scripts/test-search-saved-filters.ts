import assert from "node:assert/strict";
import {
  SAVED_FILTER_KEYS,
  getSavedFilterLabel,
  resolveSavedFilter,
} from "../src/lib/searchSavedFilters";

// Characterization test: pins current behavior only (LT-002).

assert.deepEqual([...SAVED_FILTER_KEYS], [
  "bookmarked-works",
  "followed-authors",
  "liked-authors",
  "liked-works",
  "liked-readers",
]);

for (const key of SAVED_FILTER_KEYS) {
  assert.equal(resolveSavedFilter(key), key);
}

for (const value of ["", "Bookmarked-Works", " liked-works", "liked_works", "all"]) {
  assert.equal(resolveSavedFilter(value), null, value);
}

assert.equal(getSavedFilterLabel("bookmarked-works"), "ブックマーク作品");
assert.equal(getSavedFilterLabel("followed-authors"), "フォローした作者");
assert.equal(getSavedFilterLabel("liked-authors"), "いいねした作者");
assert.equal(getSavedFilterLabel("liked-works"), "いいねした作品");
assert.equal(getSavedFilterLabel("liked-readers"), "いいねした朗読");

console.log("PASS: search saved filters (exact key resolution, Japanese labels)");
