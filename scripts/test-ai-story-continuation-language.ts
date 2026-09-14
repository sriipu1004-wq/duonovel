import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  continuationEpisodeFallbackTitle,
  continuationLanguageInstruction,
  resolveContinuationSourceLanguage,
} from "../src/lib/generation/continuationLanguage";

function main() {
  assert.equal(resolveContinuationSourceLanguage("en", "日本語の本文"), "en");
  assert.equal(resolveContinuationSourceLanguage("ko", "An English source body."), "ko");
  assert.equal(resolveContinuationSourceLanguage(null, "An English source body."), "en");
  assert.equal(continuationEpisodeFallbackTitle(2, "en"), "Episode 2");
  assert.equal(continuationEpisodeFallbackTitle(2, "ko"), "2화");
  assert.equal(continuationEpisodeFallbackTitle(2, "fr"), "Épisode 2");
  assert.match(continuationLanguageInstruction("en"), /English/);
  assert.match(continuationLanguageInstruction("ko"), /Korean/);
  assert.match(
    continuationLanguageInstruction("en"),
    /UI言語.*既存作品の原文言語/u,
    "continuation must use the stored work language rather than the UI locale"
  );

  const route = readFileSync(
    "src/app/api/time-fit-stories/continue/route.ts",
    "utf8"
  );
  assert.ok(route.includes("source_language"));
  assert.ok(route.includes("resolveContinuationSourceLanguage("));
  assert.ok(route.includes("continuationLanguageInstruction(args.sourceLanguage)"));
  assert.equal(
    route.includes("次の1話を日本語で生成してください。"),
    false,
    "continuations must not hard-code Japanese output"
  );

  console.log("PASS: AI story continuation keeps the work source language");
}

main();
