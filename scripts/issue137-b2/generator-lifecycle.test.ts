// SOURCE/runtime-helper contract: no network, no uploads or changes to real data.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const root = new URL("../../", import.meta.url);
const read = (p: string) => readFileSync(new URL(p, root), "utf8");
const generators = [
  { kind: "nemo", path: "src/lib/recording/nemoGeneration.ts", build: "buildNemoRecordingObjectPath", generate: "generateNemoRecordingForEpisode" },
  { kind: "aivis", path: "src/lib/recording/aivisGeneration.ts", build: "buildAivisRecordingObjectPath", generate: "generateAivisRecordingForEpisode" },
] as const;
const seriesId = "11111111-1111-4111-8111-111111111111";
const episodeId = "22222222-2222-4222-8222-222222222222";
let checked = 0;

for (const item of generators) {
  const source = read(item.path);
  const sf = ts.createSourceFile(item.path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const declaration = (name: string) => {
    const fn = sf.statements.find((n): n is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(n) && n.name?.text === name);
    assert.ok(fn, item.kind + " missing function " + name);
    return fn;
  };
  const builder = declaration(item.build);
  const generate = declaration(item.generate);
  const sanitizer = declaration("sanitizeStorageSegment");

  let minted = 0;
  const snippets = [sanitizer, builder].map((node) =>
    node.getText(sf).replace(/^export\s+/, "")).join("\n");
  const resultJs = ts.transpileModule(
    snippets + "\n" + item.build + ";",
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }
  ).outputText;
  const build = vm.runInNewContext(resultJs, {
    Date: { now: () => 1700000000000 },
    crypto: { randomUUID: () => {
      minted += 1;
      return minted === 1
        ? "33333333-3333-4333-8333-333333333331"
        : "33333333-3333-4333-8333-333333333332";
    } },
  }) as (args: { seriesId: string; episodeId: string; narratorName: string }) => string;

  const input = { seriesId, episodeId, narratorName: item.kind + " narrator" };
  const first = build(input), second = build(input);
  assert.notEqual(first, second, item.kind + " successive runs must have distinct object names");
  assert.ok(first.startsWith(item.kind + "/" + seriesId + "/" + episodeId + "/"), item.kind + " canonical series/episode prefix");
  assert.match(first, /\.wav$/, item.kind + " WAV path extension");
  assert.match(second, /\.wav$/, item.kind + " second WAV path extension");
  assert.equal(minted, 2, item.kind + " must mint a fresh UUID for every generation");
  checked += 5;

  const calls: ts.CallExpression[] = [];
  const walk = (n: ts.Node) => {
    if (ts.isCallExpression(n) &&
        ts.isPropertyAccessExpression(n.expression) &&
        n.expression.name.text === "upload") calls.push(n);
    ts.forEachChild(n, walk);
  };
  walk(generate);
  assert.equal(calls.length, 2, item.kind + " requires exactly audio and timing uploads");
  for (const upload of calls) {
    const options = upload.arguments[2];
    assert.ok(options && ts.isObjectLiteralExpression(options), item.kind + " missing upload options");
    const upsert = options.properties.find((p): p is ts.PropertyAssignment =>
      ts.isPropertyAssignment(p) && p.name.getText(sf) === "upsert");
    assert.ok(upsert, item.kind + " missing explicit overwrite prohibition");
    assert.equal(upsert.initializer.kind, ts.SyntaxKind.FalseKeyword, item.kind + " must not upsert old bytes");
    checked++;
  }

  // A Storage request can time out after its server-side commit. The catch path
  // must not delete a key, even when the result or DB pointer is uncertain.
  assert.doesNotMatch(source, /upsert:\s*true/, item.kind + " unexpected overwrite");
  assert.doesNotMatch(source, /\.remove\s*\(/, item.kind + " destructive Storage cleanup");
  assert.doesNotMatch(source, /removeStorageObjectPaths|removePreviousRecordingArtifactsIfNeeded|removeRecordingArtifactUrls/,
    item.kind + " unsafe legacy-media deletion helper");
  assert.match(source, /makePrivateAiAudioReference\(audioObjectPath\)/, item.kind + " keep private R18 storage reference");
  assert.match(source, /getPublicUrl\(audioObjectPath\)/, item.kind + " preserve public playback URL shape");
  checked += 5;
}

// Evaluate the real helper instead of asserting on regex spelling/escaping.
const timingSrc = read("src/lib/recording/nemoTiming.ts");
const timingTree = ts.createSourceFile("nemoTiming.ts", timingSrc, ts.ScriptTarget.Latest, true);
const timingFn = timingTree.statements.find((n): n is ts.FunctionDeclaration =>
  ts.isFunctionDeclaration(n) && n.name?.text === "buildNemoTimingObjectPathFromAudioObjectPath");
assert.ok(timingFn, "timing helper not found");
const timingCode = ts.transpileModule(
  timingFn.getText(timingTree).replace(/^export\s+/, "") +
    "\n" + "buildNemoTimingObjectPathFromAudioObjectPath;",
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }
).outputText;
const timingPath = vm.runInNewContext(timingCode) as (path: string) => string;
assert.equal(timingPath("nemo/" + seriesId + "/" + episodeId + "/new.wav"),
  "nemo/" + seriesId + "/" + episodeId + "/new.timing.json",
  "actual WAV timing pair preserved");
assert.equal(timingPath("nemo/" + seriesId + "/" + episodeId + "/other.mp3"),
  "nemo/" + seriesId + "/" + episodeId + "/other.mp3.timing.json",
  "non-WAV fallback preserved");
checked += 2;

console.log("PASS: " + checked + " Nemo/Aivis SOURCE upload lifecycle and actual path-builder checks; no hosted storage");
