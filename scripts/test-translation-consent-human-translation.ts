import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const server = source("src/lib/translation/episodeTranslationServer.ts");
assert.ok(server.includes('return series.translation_permission_mode === "open";'));
assert.equal(server.includes("if (isSeriesAiGenerated(series))"), false);
assert.equal(
  /isAllowlisted:\s*\n\s*isOwner\s*\|\|/m.test(server),
  false,
  "series owner must not bypass a closed translation permission in Reader"
);

const layout = source("src/app/read/[seriesId]/[episodeNumber]/layout.tsx");
assert.equal(
  layout.includes("payload.isOwner ||\n      (await isSeriesTranslationEligibleIncludingOfficial"),
  false
);

const createPage = source("src/app/write/series/new/page.tsx");
assert.ok(createPage.includes('initialMode="open"'));

const generatedSave = source("src/app/api/time-fit-stories/save-private/route.ts");
assert.ok(generatedSave.includes('translation_permission_mode: "open"'));
assert.ok(generatedSave.includes('recording_permission_mode: "open"'));

const publicDomain = source("scripts/public-domain/core.ts");
assert.ok(publicDomain.includes('translation_permission_mode: "open"'));
assert.ok(publicDomain.includes('recording_permission_mode: "open"'));

const permissionUi = source(
  "src/features/write/TranslationPermissionWorkspaceBridge.tsx"
);
assert.ok(
  permissionUi.includes(
    "翻訳許可は、作品をAIの学習用データとして提供する同意ではありません。"
  )
);
assert.ok(permissionUi.includes("翻訳・対訳を許可しない"));

const sourceLanguageUi = source(
  "src/features/write/SourceLanguageWorkspaceBridge.tsx"
);
assert.ok(sourceLanguageUi.includes('data-source-language-select="true"'));
assert.ok(sourceLanguageUi.includes("data-source-language-status-host"));

const humanApi = source("src/app/api/human-translations/[episodeId]/route.ts");
assert.ok(humanApi.includes('from("user_episode_translations")'));
assert.ok(humanApi.includes("access.isAllowlisted"));
assert.ok(humanApi.includes("user_id: user.id"));

const translationStatus = source(
  "src/app/api/episode-translations/[episodeId]/route.ts"
);
assert.ok(translationStatus.includes('translationModel: "human-self"'));
assert.ok(translationStatus.includes("personalHumanTranslation: true"));

const gate = source("src/features/playback/PublicTranslationUnlockGate.tsx");
assert.ok(gate.includes("manualTranslationHref"));
assert.ok(gate.includes("自分で翻訳を作る"));

const migration = source(
  "supabase/migrations/20260923130000_add_private_human_episode_translations.sql"
);
assert.ok(migration.includes("create table if not exists public.user_episode_translations"));
assert.ok(migration.includes("enable row level security"));
assert.ok(migration.includes("translation_permission_mode set default 'open'"));
assert.ok(migration.includes("(select auth.uid()) = user_id"));

console.log("translation consent / private human translation regression checks passed");
