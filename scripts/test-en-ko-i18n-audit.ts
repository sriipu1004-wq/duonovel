import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { billingPromptDictionaries } from "../src/i18n/dictionaries/billingPrompt";
import { bilingualReaderDictionaries } from "../src/i18n/dictionaries/bilingualReader";
import { continuationDictionaries } from "../src/i18n/dictionaries/continuation";
import { generatedReaderDictionaries } from "../src/i18n/dictionaries/generatedReader";
import { readPageDictionaries } from "../src/i18n/dictionaries/readPage";

const JAPANESE_SCRIPT = /[ぁ-んァ-ヶ一-龯々〆ヵヶ]/u;

function collectStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(collectStrings);
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).flatMap(collectStrings);
  }
  return [];
}

function assertDictionaryHasNoJapanese(name: string, dictionary: unknown) {
  for (const value of collectStrings(dictionary)) {
    assert.equal(
      JAPANESE_SCRIPT.test(value),
      false,
      `${name} contains unexpected Japanese UI copy: ${value}`
    );
  }
}

function assertNoKnownUiLiteral(path: string, literals: readonly string[]) {
  const source = readFileSync(path, "utf8");
  for (const literal of literals) {
    assert.equal(
      source.includes(literal),
      false,
      `${path} still contains user-facing Japanese literal: ${literal}`
    );
  }
}

function main() {
  for (const locale of ["en", "ko"] as const) {
    assertDictionaryHasNoJapanese(`billingPrompt.${locale}`, billingPromptDictionaries[locale]);
    assertDictionaryHasNoJapanese(`bilingualReader.${locale}`, bilingualReaderDictionaries[locale]);
    assertDictionaryHasNoJapanese(`continuation.${locale}`, continuationDictionaries[locale]);
    assertDictionaryHasNoJapanese(`generatedReader.${locale}`, generatedReaderDictionaries[locale]);
    assertDictionaryHasNoJapanese(`readPage.${locale}`, readPageDictionaries[locale]);

    assert.equal(JAPANESE_SCRIPT.test(bilingualReaderDictionaries[locale].responseInvalid(500)), false);
    assert.equal(JAPANESE_SCRIPT.test(bilingualReaderDictionaries[locale].episodeFallback(3)), false);
    assert.equal(JAPANESE_SCRIPT.test(continuationDictionaries[locale].minutes(10)), false);
    assert.equal(JAPANESE_SCRIPT.test(generatedReaderDictionaries[locale].approxMinutes(10)), false);
    assert.equal(JAPANESE_SCRIPT.test(readPageDictionaries[locale].episode(3)), false);
  }

  assertNoKnownUiLiteral("src/features/generation/ContinueStoryAction.tsx", [
    "この物語の続きを作る",
    "続きを作る",
    "続きへの希望（任意）",
    "生成中…",
  ]);
  assertNoKnownUiLiteral("src/features/playback/BilingualEpisodePlayback.tsx", [
    "対訳 ON",
    "OFFに戻す",
    "単語解説",
    "対訳を生成できませんでした。",
  ]);
  assertNoKnownUiLiteral("src/features/playback/BilingualDivider.tsx", [
    "原文と対訳の表示比率",
    "上下を入れ替える",
  ]);
  assertNoKnownUiLiteral("src/features/playback/BilingualHeightHandle.tsx", [
    "対訳表示全体の高さ",
    "上下にドラッグして対訳表示の高さを変更",
  ]);
  assertNoKnownUiLiteral("src/features/billing/SubscriptionUpgradePrompt.tsx", [
    "無料分を使い切りました。",
    "サブスクを見る",
  ]);

  console.log("PASS: EN/KO i18n dictionaries and known residual UI literals");
}

main();
