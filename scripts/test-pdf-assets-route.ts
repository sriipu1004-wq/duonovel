import assert from "node:assert/strict";
import { GET } from "../src/app/api/pdf-assets/[kind]/[name]/route";
import { isSafePdfAssetName, resolvePdfAssetFolder } from "../src/lib/pdfAssets";

// KD-10: /api/pdf-assets/[kind]/[name] accepts only its own allow-listed kinds.

assert.equal(resolvePdfAssetFolder("cmaps"), "cmaps");
assert.equal(resolvePdfAssetFolder("standard_fonts"), "standard_fonts");
for (const kind of [
  "",
  "constructor",
  "__proto__",
  "toString",
  "hasOwnProperty",
  "valueOf",
  "CMAPS",
  "unknown",
]) {
  assert.equal(resolvePdfAssetFolder(kind), null, `kind ${JSON.stringify(kind)}`);
}

assert.equal(isSafePdfAssetName("78-EUC-H.bcmap"), true);
for (const name of ["", ".", "..", "../x", "a/b", "a\\b", "a b", "%2e%2e"]) {
  assert.equal(isSafePdfAssetName(name), false, `name ${JSON.stringify(name)}`);
}

async function status(kind: string, name: string): Promise<number> {
  const response = await GET(new Request("http://localhost/api/pdf-assets"), {
    params: Promise.resolve({ kind, name }),
  });
  return response.status;
}

async function main() {
  for (const kind of ["constructor", "__proto__", "toString", "unknown"]) {
    assert.equal(await status(kind, "78-EUC-H.bcmap"), 404, `GET kind ${kind}`);
  }
  assert.equal(await status("cmaps", ".."), 404);
  assert.equal(await status("cmaps", "does-not-exist.bcmap"), 404);
  // Positive path only when pdfjs-dist is installed locally.
  const ok = await status("cmaps", "78-EUC-H.bcmap");
  assert.ok(ok === 200 || ok === 404, `unexpected status ${ok}`);
  console.log(`PASS: pdf-assets route kind allow-list (existing cmap status ${ok})`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
