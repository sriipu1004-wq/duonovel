import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

function assertContains(path: string, literals: readonly string[]): void {
  const value = source(path);
  for (const literal of literals) {
    assert.equal(
      value.includes(literal),
      true,
      `${path} must contain: ${literal}`
    );
  }
}

function assertOmits(path: string, literals: readonly string[]): void {
  const value = source(path);
  for (const literal of literals) {
    assert.equal(
      value.includes(literal),
      false,
      `${path} must not contain obsolete copy/structure: ${literal}`
    );
  }
}

function main() {
  const createPage = "src/app/write/series/new/page.tsx";
  assertContains(createPage, [
    "<SeriesStatusPortal>",
    "<SourceLanguageWorkspaceBridge embedded />",
  ]);
  assertOmits(createPage, ["<SourceLanguageWorkspaceBridge />"]);

  const seriesForm = "src/features/write/WriteSeriesForm.tsx";
  assertContains(seriesForm, [
    'id="series-title"',
    'data-source-language-select',
    "以下を確認してください",
    "作品タイトルを入力してください。",
    "原文言語を選択してください。",
    "1話目の予約日時を入力してください。",
    'className="inline-flex min-h-11 w-full items-center justify-center rounded-full bg-black',
    'disabled={saveState === "saving"}',
    "submittingRef.current",
  ]);
  assertOmits(seriesForm, [
    "作品作成の時点で、1話目を 投稿 / 予約投稿 / 下書き保存 のどれで始めるかを先に決める。",
    "1話目を作成した時点で投稿済みとして扱う。",
    "1話目は予約投稿として保存し、到達時刻で公開対象にする。",
    "1話目は下書きとして保存し、作品ワークスペースから続けて書く。",
    "作品ページのレビュー欄と、読む画面末尾のエピソードコメント欄を作品単位で出し分ける。",
    "OFF の時は作品ページでレビュー欄を出さない。",
    "OFF の時は読む画面末尾でコメント欄を出さない。",
    "setErrorMessage(result.error.message)",
  ]);

  const sourceLanguage = "src/features/write/SourceLanguageWorkspaceBridge.tsx";
  assertContains(sourceLanguage, [
    'id="series-source-language"',
    'data-source-language-select="true"',
    "作品を作成する前に原文言語を選択してください。",
    "Choose the original language before creating the work.",
    "작품을 만들기 전에 원문 언어를 선택하세요.",
  ]);
  assertOmits(sourceLanguage, ["setMessage(payload.message || dictionary.failed)"]);

  const episodeForm = "src/features/write/WriteEpisodeForm.tsx";
  assertContains(episodeForm, [
    'id="episode-title"',
    'id="episode-posting-status"',
    'id="episode-scheduled-for"',
    "以下を確認してください",
    "話タイトルを入力してください。",
    "予約日時を入力してください。",
    'disabled={isSaving}',
    "submittingRef.current",
  ]);
  assertOmits(episodeForm, [
    "setErrorMessage(result.error.message)",
    "setErrorMessage(result.error?.message",
  ]);

  const localeBridge = "src/i18n/AuthoringUiLocaleBridge.tsx";
  assertContains(localeBridge, [
    '"作品状態": "Work status"',
    '"作品状態": "작품 상태"',
    '"以下を確認してください": "Check the following"',
    '"以下を確認してください": "다음 항목을 확인하세요"',
    '"原文言語を選択してください。": "Choose the original language."',
    '"原文言語を選択してください。": "원문 언어를 선택하세요."',
    '"コンテンツ警告": "Content warnings"',
    '"コンテンツ警告": "콘텐츠 경고"',
    '"対訳許可": "Translation allowed"',
    '"対訳許可": "번역 허용"',
  ]);

  const editPage = "src/app/write/series/[seriesId]/page.tsx";
  assertContains(editPage, [
    "<SeriesStatusPortal>",
    "<SourceLanguageWorkspaceBridge",
    "<SeriesTranslationGlossaryWorkspace",
    "<TranslationPermissionWorkspaceBridge",
    "<ContentRatingWorkspaceBridge",
  ]);

  const workspaceCss = "src/app/write/series/[seriesId]/page.module.css";
  assertContains(workspaceCss, [
    "max-height: 36rem;",
    "overflow-y: auto;",
    "overscroll-behavior: contain;",
  ]);

  const translationPermission =
    "src/features/write/TranslationPermissionWorkspaceBridge.tsx";
  assertContains(translationPermission, [
    "NARRATION_PERMISSION_LABELS",
    "/translation-permission",
    '"対訳許可を更新できませんでした。"',
  ]);

  const contentRating = "src/features/write/ContentRatingWorkspaceBridge.tsx";
  assertContains(contentRating, [
    "PUBLICATION_LABELS",
    '"sexual_r18"',
    '"コンテンツ警告を更新できませんでした。"',
  ]);

  console.log(
    "PASS: author workspace UX grouping, validation, locale copy, and preserved workspace controls"
  );
}

main();
