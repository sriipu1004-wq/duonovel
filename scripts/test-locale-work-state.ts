import assert from "node:assert/strict";
import {
  isLocalizedPath,
  isLocalizedPathWithin,
} from "../src/lib/navigation/matchLocalizedPath";

const seriesId = "series-1";
const workPath = `/works/${seriesId}`;
const readPath = `/read/${seriesId}/`;

for (const pathname of [workPath, `/en${workPath}`, `/ko${workPath}`]) {
  assert.equal(isLocalizedPath(pathname, workPath), true, pathname);
}

for (const pathname of [
  `${readPath}1`,
  `/en${readPath}1`,
  `/ko${readPath}1`,
]) {
  assert.equal(isLocalizedPathWithin(pathname, readPath), true, pathname);
}

assert.equal(isLocalizedPath(`/ko/read/${seriesId}/1`, workPath), false);
assert.equal(isLocalizedPathWithin(`/ko/read/another-series/1`, readPath), false);

console.log("locale work state tests passed");
