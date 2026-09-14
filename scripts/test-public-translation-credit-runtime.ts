import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolveTranslationCreditPolicy } from "../src/lib/translation/publicTranslationCreditPolicy";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

function main() {
  assert.equal(
    resolveTranslationCreditPolicy({
      authenticated: true,
      alreadyUnlocked: true,
      dailyUsed: 30,
      dailyLimit: 30,
      creditBalance: 2,
    }),
    "unlocked",
    "existing unlock must win before allowance or credit"
  );
  assert.equal(
    resolveTranslationCreditPolicy({
      authenticated: true,
      alreadyUnlocked: false,
      dailyUsed: 2,
      dailyLimit: 3,
      creditBalance: 10,
    }),
    "included_available",
    "included allowance must win before purchased credit"
  );
  assert.equal(
    resolveTranslationCreditPolicy({
      authenticated: true,
      alreadyUnlocked: false,
      dailyUsed: 3,
      dailyLimit: 3,
      creditBalance: 2,
    }),
    "credit_required",
    "credit is only offered after allowance is exhausted"
  );
  assert.equal(
    resolveTranslationCreditPolicy({
      authenticated: true,
      alreadyUnlocked: false,
      dailyUsed: 30,
      dailyLimit: 30,
      creditBalance: 0,
    }),
    "purchase_required",
    "exhausted Premium allowance without credit needs purchase/wait flow"
  );
  assert.equal(
    resolveTranslationCreditPolicy({
      authenticated: false,
      alreadyUnlocked: false,
      dailyUsed: 0,
      dailyLimit: 3,
      creditBalance: 0,
    }),
    "login_required",
    "translation entitlement must be account-bound"
  );
  assert.equal(
    resolveTranslationCreditPolicy({
      authenticated: true,
      alreadyUnlocked: false,
      dailyUsed: 3,
      dailyLimit: 3,
      creditBalance: -2,
    }),
    "purchase_required",
    "negative balance cannot unlock more translations"
  );

  const foundation = source(
    "supabase/migrations/20260912100000_add_public_translation_unlocks_credit_ledger.sql"
  );
  const unlockTableStart = foundation.indexOf(
    "create table if not exists public.public_episode_translation_unlocks"
  );
  const unlockTableEnd = foundation.indexOf(
    "create unique index if not exists public_episode_translation_unlocks_identity_key"
  );
  const unlockTable = foundation.slice(unlockTableStart, unlockTableEnd);
  assert.ok(unlockTableStart >= 0 && unlockTableEnd > unlockTableStart);
  assert.equal(
    /source_hash\s+(text|uuid|varchar)/i.test(unlockTable),
    false,
    "unlock identity must remain source_hash-independent"
  );

  const runtimeMigration = source(
    "supabase/migrations/20260914070000_add_public_translation_credit_runtime.sql"
  );
  assert.ok(runtimeMigration.includes("unlock_public_episode_translation_included"));
  assert.ok(runtimeMigration.includes("usage_reason"));
  assert.ok(runtimeMigration.includes("public_translation_unlock"));
  assert.ok(
    runtimeMigration.includes("log.action_type in ('story_generation', 'translation_generation')"),
    "Free unlock must share the existing story/translation bucket"
  );
  assert.ok(
    runtimeMigration.includes("log.action_type = 'translation_generation'"),
    "Premium unlock must use the existing 30/day translation bucket"
  );
  assert.ok(
    runtimeMigration.indexOf("v_unlock.id is not null") <
      runtimeMigration.indexOf("v_limit = 0 or v_used >= v_limit"),
    "existing unlock must be checked before allowance exhaustion"
  );

  const expiryMigration = source(
    "supabase/migrations/20260914071000_enforce_credit_purchase_expiration.sql"
  );
  assert.ok(expiryMigration.includes("refresh_credit_expirations"));
  assert.ok(expiryMigration.includes("entry_type"));
  assert.ok(expiryMigration.includes("'expiration'"));
  assert.ok(
    expiryMigration.includes("order by lot.expires_at asc, lot.created_at asc"),
    "purchased credits must allocate earliest expiry first"
  );

  const appendOnlyFix = source(
    "supabase/migrations/20260914072000_fix_credit_unlock_append_only.sql"
  );
  assert.equal(
    /update\s+public\.credit_ledger/i.test(appendOnlyFix),
    false,
    "final unlock function must never UPDATE the append-only ledger"
  );
  assert.ok(appendOnlyFix.includes("purchase_lot_id"));

  const creditsServer = source(
    "src/lib/translation/publicTranslationCredits.server.ts"
  );
  assert.ok(creditsServer.includes('PUBLIC_TRANSLATION_CREDITS_ENABLED'));
  assert.ok(creditsServer.includes('refresh_credit_expirations'));
  assert.ok(creditsServer.includes('reader_unlock'));

  const readRoute = source("src/app/api/episode-translations/[episodeId]/route.ts");
  assert.ok(
    readRoute.includes('entitlement.status !== "unlocked"') &&
      readRoute.includes("Never leak cached translated text before unlock"),
    "ready cache payload must be withheld until entitlement exists"
  );

  const generateRoute = source("src/app/api/episode-translations/generate/route.ts");
  const generationCall = generateRoute.indexOf("executeEpisodeTranslationGeneration(");
  const readyCheck = generateRoute.indexOf('result.status !== "ready"');
  const includedFinalize = generateRoute.indexOf("finalizePublicTranslationIncludedUnlock", readyCheck);
  const creditFinalize = generateRoute.indexOf("finalizePublicTranslationCreditUnlock", readyCheck);
  assert.ok(generationCall >= 0 && readyCheck > generationCall);
  assert.ok(
    includedFinalize > readyCheck && creditFinalize > readyCheck,
    "allowance/credit finalization must happen only after asset generation is ready"
  );
  assert.ok(generateRoute.includes('credit_confirmation_required'));
  assert.ok(generateRoute.includes('insufficient_credit_after_generation'));
  assert.ok(generateRoute.includes('assetReady: true'));

  const executeRoute = source(
    "src/lib/translation/executeEpisodeTranslationGeneration.ts"
  );
  assert.ok(executeRoute.includes("reserveSubscriberAiCostOnly"));
  assert.ok(
    executeRoute.includes("reserveEpisodeTranslation({"),
    "global translation request/cost guard must remain active"
  );

  const unlockRoute = source("src/app/api/episode-translations/unlock/route.ts");
  assert.ok(unlockRoute.includes("resolveEpisodeTranslationAccess"));
  assert.ok(unlockRoute.includes("getPublicTranslationEntitlementState"));
  assert.ok(unlockRoute.includes('translation_not_ready'));
  assert.ok(unlockRoute.includes('authentication_required'));
  assert.ok(
    unlockRoute.includes('entitlement.status === "included_available" && method !== "included"') &&
      unlockRoute.includes('error: "included_unlock_required"'),
    "cache-ready API must not let a caller spend credit before included allowance"
  );
  assert.ok(
    unlockRoute.includes('entitlement.status === "credit_required" && method !== "credit"'),
    "credit unlock must require the server-computed credit-required state"
  );
  assert.equal(
    /credits\s*:\s*payload\./.test(unlockRoute),
    false,
    "client must not supply credit quantity"
  );

  const shell = source("src/features/playback/ReadBilingualShell.tsx");
  assert.ok(shell.includes('<BilingualEpisodePlayback'));
  assert.ok(shell.includes('<TranslationOnlyEpisodePlayback'));
  assert.ok(shell.includes('<PublicTranslationUnlockGate'));
  assert.ok(shell.includes('onConfirmIncluded={() => completeEntitlement("included")}'));
  assert.ok(shell.includes('completeEntitlement("credit")'));
  assert.equal(
    shell.includes('void completeEntitlement("included")'),
    false,
    "included allowance must never be consumed automatically on mode switch"
  );

  const gate = source("src/features/playback/PublicTranslationUnlockGate.tsx");
  assert.ok(gate.includes("本日の利用枠を1回使って"));
  assert.ok(gate.includes("Unlock this episode for 1 credit"));
  assert.ok(gate.includes("1크레딧으로 이 화 잠금 해제"));
  assert.ok(gate.includes("1クレジットで解放"));
  assert.ok(gate.includes("same translation language without another charge"));

  const pane = source("src/features/playback/BilingualPane.tsx");
  assert.equal(
    pane.includes("tokenizeForWordSelection"),
    false,
    "tap-to-word lookup must not be rendered in the public bilingual pane"
  );
  assert.equal(
    pane.includes("onSelectWord({"),
    false,
    "public bilingual pane must not trigger word-explanation requests"
  );

  const cleanup = source("src/app/bilingualReaderCleanup.css");
  assert.ok(cleanup.includes("button:last-child"));
  assert.ok(cleanup.includes("span:last-of-type"));

  console.log("PASS: public translation credit runtime fixture");
}

main();
