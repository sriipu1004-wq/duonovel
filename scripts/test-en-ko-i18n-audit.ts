import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { billingPromptDictionaries } from "../src/i18n/dictionaries/billingPrompt";
import { bilingualReaderDictionaries } from "../src/i18n/dictionaries/bilingualReader";
import { continuationDictionaries } from "../src/i18n/dictionaries/continuation";
import { episodeCommentsDictionaries } from "../src/i18n/dictionaries/episodeComments";
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

function assertSourceContains(path: string, literals: readonly string[]) {
  const source = readFileSync(path, "utf8");
  for (const literal of literals) {
    assert.equal(
      source.includes(literal),
      true,
      `${path} must contain localized render guard: ${literal}`
    );
  }
}

function main() {
  for (const locale of ["en", "ko"] as const) {
    assertDictionaryHasNoJapanese(`billingPrompt.${locale}`, billingPromptDictionaries[locale]);
    assertDictionaryHasNoJapanese(`bilingualReader.${locale}`, bilingualReaderDictionaries[locale]);
    assertDictionaryHasNoJapanese(`continuation.${locale}`, continuationDictionaries[locale]);
    assertDictionaryHasNoJapanese(`episodeComments.${locale}`, episodeCommentsDictionaries[locale]);
    assertDictionaryHasNoJapanese(`generatedReader.${locale}`, generatedReaderDictionaries[locale]);
    assertDictionaryHasNoJapanese(`readPage.${locale}`, readPageDictionaries[locale]);

    assert.equal(JAPANESE_SCRIPT.test(bilingualReaderDictionaries[locale].responseInvalid(500)), false);
    assert.equal(JAPANESE_SCRIPT.test(bilingualReaderDictionaries[locale].episodeFallback(3)), false);
    assert.equal(JAPANESE_SCRIPT.test(continuationDictionaries[locale].minutes(10)), false);
    assert.equal(JAPANESE_SCRIPT.test(episodeCommentsDictionaries[locale].count(2)), false);
    assert.equal(JAPANESE_SCRIPT.test(episodeCommentsDictionaries[locale].listTitle(3)), false);
    assert.equal(JAPANESE_SCRIPT.test(episodeCommentsDictionaries[locale].commentTooLong(300)), false);
    assert.equal(JAPANESE_SCRIPT.test(generatedReaderDictionaries[locale].metadataTitle), false);
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
  assertNoKnownUiLiteral("src/features/playback/GeneratedStoryBilingualPlayback.tsx", [
    "AI生成短編",
    "生成した物語",
    "作者 AI生成",
    "このタブで言語固定",
    "対訳 ON",
    "OFFに戻す",
    "この言語の対訳は未生成です",
    "保存済み対訳を確認中",
    "原文表示に戻る",
  ]);
  assertNoKnownUiLiteral("src/features/playback/GeneratedStoryBilingualBridge.tsx", [
    "生成した物語の一時データを読み込めませんでした。",
    "ブラウザ朗読",
    "対訳をオン",
  ]);
  assertNoKnownUiLiteral("src/features/playback/useBilingualWordExplanation.ts", [
    "対訳を確認できませんでした。",
    "文中での意味を確認できませんでした。",
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
  assertNoKnownUiLiteral("src/features/playback/ReaderFooterControls.tsx", [
    "aria-label=\"朗読速度を下げる\"",
    "aria-label=\"朗読速度を上げる\"",
  ]);
  assertNoKnownUiLiteral("src/features/comment/EpisodeCommentSection.tsx", [
    "この話の感想",
    "ログインして感想を書く",
    "感想一覧を読み込み中...",
    "コメント一覧の取得に失敗した。",
  ]);
  assertNoKnownUiLiteral("src/features/playback/WebSpeechEpisodePlayback.tsx", [
    "`${Math.floor(humanCurrentTime)}秒 / ${Math.floor(humanDuration)}秒`",
    "setAudioError(\"公開朗読音声の読み込みに失敗した。\")",
  ]);
  assertNoKnownUiLiteral(
    "src/app/read/generated/[storyId]/GeneratedStoryReaderClient.tsx",
    ["{sceneLabel} / {genreLabel} / {request.mood}"]
  );
  assertNoKnownUiLiteral("src/app/read/generated/[storyId]/page.tsx", [
    "title: \"一時生成の物語 | LIB read\"",
  ]);
  assertSourceContains("src/features/playback/ReaderFooterControls.tsx", [
    "aria-label={dictionary.slower}",
    "aria-label={dictionary.faster}",
  ]);
  assertSourceContains("src/features/comment/EpisodeCommentSection.tsx", [
    "episodeCommentsDictionaries[useUiLocale()]",
    "{dictionary.title}",
    "{dictionary.loading}",
  ]);
  assertSourceContains("src/features/playback/WebSpeechEpisodePlayback.tsx", [
    "WEB_SPEECH_LOCALE_COPY[locale].seconds",
    "WEB_SPEECH_LOCALE_COPY[locale].publicNarrationLoadFailed",
  ]);
  assertSourceContains("src/features/playback/GeneratedStoryBilingualPlayback.tsx", [
    "bilingualReaderDictionaries[locale]",
    'localizePath("/subscription", locale)',
    "readerDictionary.studyWordHelp",
  ]);
  assertSourceContains("src/features/playback/GeneratedStoryBilingualBridge.tsx", [
    "readerDictionaries[locale]",
    "localizePath(generated.readHref, locale)",
  ]);
  assertSourceContains("src/features/playback/useBilingualWordExplanation.ts", [
    "readerDictionaries[locale]",
    "locale === \"ja\" && payload.message?.trim()",
  ]);
  assertSourceContains(
    "src/app/read/generated/[storyId]/GeneratedStoryReaderClient.tsx",
    ["request.mood === \"指定なし\" ? generateDictionary.none : request.mood", "{moodLabel}"]
  );
  assertSourceContains("src/app/read/generated/[storyId]/page.tsx", [
    "generatedReaderDictionaries[locale]",
    "dictionary.metadataTitle",
  ]);
  assertSourceContains("src/app/library/layout.tsx", [
    "getUiLocale",
    "generateMetadata",
    "My Library | LIB read",
    "개인 서재 | LIB read",
  ]);

  console.log("PASS: EN/KO i18n dictionaries and known residual UI literals");
}

main();
