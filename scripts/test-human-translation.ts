import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  TRANSLATION_SEGMENT_VERSION,
} from "../src/lib/translation/translationPayload";
import { segmentSourceDocument } from "../src/lib/translation/segmentSourceDocument";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

function contains(path: string, literals: readonly string[]): void {
  const value = source(path);
  for (const literal of literals) {
    assert.equal(value.includes(literal), true, `${path} must contain: ${literal}`);
  }
}

function omits(path: string, literals: readonly string[]): void {
  const value = source(path);
  for (const literal of literals) {
    assert.equal(value.includes(literal), false, `${path} must omit: ${literal}`);
  }
}

assert.equal(
  TRANSLATION_SEGMENT_VERSION,
  3,
  "Human translation must share canonical translation segment version 3"
);

const punctuationDocument = segmentSourceDocument("「……」\n\n—", "ja");
assert.ok(
  punctuationDocument.segments.length >= 2,
  "punctuation-only source segments must remain representable"
);

const migration =
  "supabase/migrations/20260926100000_add_human_translation_foundation.sql";
contains(migration, [
  "human_translation_permission_mode text not null default 'closed'",
  "check (human_translation_permission_mode in ('open', 'closed'))",
  "effect_settings #>> '{publicDomain,rightsChecked}'",
  "create table if not exists public.episode_human_translations",
  "references auth.users(id) on delete cascade",
  "unique (episode_id, target_language, translator_user_id)",
  "status in ('draft', 'published', 'withdrawn')",
  "draft_payload jsonb",
  "published_payload jsonb",
  "published_source_hash text",
  "alter table public.episode_human_translations enable row level security",
  "grant select on table public.episode_human_translations to anon, authenticated",
]);
omits(migration, [
  "OFFICIAL_ACCOUNT_EMAIL",
  "author_id =",
  "grant insert on table public.episode_human_translations to authenticated",
  "grant update on table public.episode_human_translations to authenticated",
]);

const workspace = "src/features/write/WriteSeriesForm.tsx";
contains(workspace, [
  'mode === "create"\n        ? "open"',
  "human_translation_permission_mode: args.humanTranslationPermissionMode",
  "recording_permission_mode: args.recordingPermissionMode",
  "translation_permission_mode: args.translationPermissionMode",
  "libread:human-translation-permission-selection-changed",
]);

const humanPermission =
  "src/features/write/HumanTranslationPermissionWorkspaceBridge.tsx";
contains(humanPermission, [
  '"人による翻訳"',
  '"Human translation"',
  '"사람 번역"',
  "ONにしても本文をAIサービスへ送信しません",
  "Already-published translations are not deleted.",
  "/human-translation-permission",
  "libread:human-translation-permission-selection-changed",
]);

const aiPermission =
  "src/features/write/TranslationPermissionWorkspaceBridge.tsx";
contains(aiPermission, [
  '"AI翻訳（対訳生成）"',
  "OpenAI API",
  '"AI translation (bilingual generation)"',
  '"AI 번역(대역 생성)"',
  "libread:translation-permission-selection-changed",
]);

const publicDomain = "scripts/public-domain/core.ts";
contains(publicDomain, [
  'translation_permission_mode: "open"',
  'human_translation_permission_mode: "open"',
  'recording_permission_mode: "open"',
  "rightsChecked: true",
]);

const humanServer = "src/lib/translation/humanTranslationServer.ts";
contains(humanServer, [
  "buildEpisodeTranslationSource(",
  "buildEpisodeTranslationSourceHash(access.body)",
  "sourceCounts.get(segment.sourceText)",
  "reusable.get(segment.sourceText)",
  "validatePublishableHumanPayload",
  "!actual.translatedText.trim()",
  "published_source_hash",
]);
omits(humanServer, [
  "openAITranslation",
  "reserve_libread_daily_ai_action",
  "publicTranslationCredits",
  "translation_model",
]);

const draft = "src/app/api/human-translations/draft/route.ts";
contains(draft, [
  "context.currentUserId",
  "context.humanPermissionOpen",
  'status: "draft"',
  'error?.code === "23505"',
  "translator_user_id: context.currentUserId",
]);
omits(draft, ["OpenAI", "credit", "unlock", "episode_translations"]);

const mutate = "src/app/api/human-translations/[translationId]/route.ts";
contains(mutate, [
  "row.translator_user_id !== current.currentUserId",
  "buildHumanDraftPayloadFromTranslations",
  "draft_payload: draftPayload",
  "4_000_000",
  'status: "ready"',
  'provenance: "human"',
  '.select("display_name")',
]);
omits(mutate, [
  'select("email',
  'email.split("@")',
  "OpenAI",
  "credit",
  "unlock",
]);

const publish =
  "src/app/api/human-translations/[translationId]/publish/route.ts";
contains(publish, [
  "rightsConfirmed !== true",
  "row.translator_user_id !== current.currentUserId",
  "!current.humanPermissionOpen",
  "row.source_hash !== current.sourceHash",
  "validatePublishableHumanPayload",
  '.select("display_name")',
  'status: "published"',
  "published_payload: publishable",
  "published_source_hash: current.sourceHash",
]);
omits(publish, [
  'select("email',
  'email.split("@")',
  "OpenAI",
  "credit",
  "unlock",
  "reserve_libread_daily_ai_action",
]);

const withdraw =
  "src/app/api/human-translations/[translationId]/withdraw/route.ts";
contains(withdraw, [
  "await supabase.auth.getUser()",
  ".eq(\"translator_user_id\", authData.user.id)",
  'status: "withdrawn"',
]);
omits(withdraw, ["delete()", ".delete("]);

const list = "src/app/api/human-translations/episode/[episodeId]/route.ts";
contains(list, [
  '.select("id,translator_user_id,target_language,published_at,updated_at")',
  '.eq("status", "published")',
  '.eq("published_source_hash", current.sourceHash)',
  '.select("id,display_name")',
  "isAuthor: translatorId === current.seriesAuthorId",
]);
omits(list, ["published_payload", "draft_payload", "email"]);

const editor = "src/features/translation/HumanTranslationEditor.tsx";
contains(editor, [
  '"AIは使用せず、あなたが入力した翻訳だけを保存・公開します。"',
  '"Save draft"',
  '"Publish"',
  '"Withdraw publication"',
  "beforeunload",
  "defaultValue={segment.translatedText}",
  "translationsRef",
  "rightsConfirmed",
]);
omits(editor, [
  "OpenAI",
  "generateTranslation",
  "AI補完",
]);

const editorPage = "src/app/translate/[seriesId]/[episodeNumber]/page.tsx";
contains(editorPage, [
  "robots: { index: false, follow: false }",
  "requireLoggedInUser(nextPath)",
  'getSeriesPublicationStatus(series) !== "public"',
  "!isEpisodePubliclyVisible(episode)",
  "isR18Series(series)",
  "getCurrentR18ViewerPreference()",
]);

const shell = "src/features/playback/ReadBilingualShell.tsx";
contains(shell, [
  "humanTranslationPermissionOpen",
  "loadHumanTranslationOptions",
  "TranslationSourceSelector",
  "humanTranslations.length > 0 || humanTranslationPermissionOpen",
  "selectedHumanTranslationId",
  'translationSourceKey === "ai"',
  "translationProvenance={",
  "humanTranslationId={selectedHumanTranslationId}",
  "translateYourself",
]);
const selector = "src/features/playback/TranslationSourceSelector.tsx";
contains(selector, [
  "if (humanTranslations.length === 0) return null",
  '"AI translation"',
  '"Human — " + name',
  '"Author translation"',
  '"작가 번역"',
]);

const bilingual = "src/features/playback/BilingualEpisodePlayback.tsx";
contains(bilingual, [
  'translationProvenance?: "ai" | "human"',
  'translationProvenance === "human" && humanTranslationId',
  '"/api/human-translations/"',
  'translationProvenance !== "ai"',
  'translationProvenance === "ai" ? handleSelectWord : undefined',
]);
const translationOnly =
  "src/features/playback/TranslationOnlyEpisodePlayback.tsx";
contains(translationOnly, [
  'translationProvenance?: "ai" | "human"',
  'translationProvenance === "human" && humanTranslationId',
  '"/api/human-translations/"',
  'translationProvenance !== "ai"',
]);

const noAiStoryFiles = [
  "src/features/playback/ReadBilingualShell.tsx",
  "src/features/translation/HumanTranslationEditor.tsx",
  "src/lib/translation/humanTranslationServer.ts",
  "src/app/api/human-translations/draft/route.ts",
  "src/app/api/human-translations/[translationId]/route.ts",
  "src/app/api/human-translations/[translationId]/publish/route.ts",
];
for (const path of noAiStoryFiles) {
  omits(path, [
    "time_fit_ai_story",
    "story_generation",
    "generated_story",
    "story continuation",
  ]);
}

console.log(
  "PASS: Human translation permission, provenance, editor, stale safety, Reader integration, free/no-AI boundaries, and AI-story regression guards are present"
);
