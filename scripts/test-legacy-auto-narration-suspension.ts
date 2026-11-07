// Issue #137 R0: legacy automatic AI narration is declared suspended
// (src/lib/recording/legacyAutoNarration.ts). Every server entrypoint that can
// seed or run the legacy Nemo/Aivis autogen queue must fail closed before it
// touches the service-role client, config or Storage, so no new PUBLIC
// recording-audio objects can be produced through this path.
//
// Run with: node --import tsx scripts/test-legacy-auto-narration-suspension.ts
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import Module from "node:module";
import { join } from "node:path";

// `server-only` throws outside a React Server Components bundle. Stub only that
// marker module for this Node-level test; all real modules load unchanged.
const moduleWithLoad = Module as unknown as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown;
};
const originalLoad = moduleWithLoad._load;
moduleWithLoad._load = function (request, parent, isMain) {
  if (request === "server-only") return {};
  return originalLoad.call(this, request, parent, isMain);
};

// Make any accidental service-role / config access observable: valid-looking
// autogen config, but a Supabase URL that cannot be contacted and a sentinel
// that we assert is never reached.
process.env.VOICEVOX_NEMO_AUTOGEN_USER_ID = "00000000-0000-4000-8000-000000000001";
process.env.VOICEVOX_NEMO_AUTOGEN_SPEAKER_ID = "1";
process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:9";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-only-not-a-key";

const originalFetch = globalThis.fetch;
let networkCalls = 0;
globalThis.fetch = (async () => {
  networkCalls += 1;
  throw new Error("network access is forbidden while legacy autogen is suspended");
}) as typeof fetch;

async function main() {
  const { LEGACY_AUTO_NARRATION_SUSPENDED } = await import(
    "../src/lib/recording/legacyAutoNarration"
  );
  assert.equal(
    LEGACY_AUTO_NARRATION_SUSPENDED,
    true,
    "this regression covers the currently declared suspended state"
  );

  const nemo = await import("../src/lib/recording/nemoAutoGeneration");
  const aivis = await import("../src/lib/recording/aivisAutoGeneration");

  const pending = await nemo.runNextPendingNemoAutogenJob();
  assert.deepEqual(pending, {
    ok: true,
    status: "skipped",
    reason: "legacy_auto_narration_suspended",
  });

  const step = await nemo.runNemoAutoGenerationStep({
    seriesId: "series-1",
    episodeIds: ["episode-1"],
  });
  assert.equal(step.status, "skipped");
  assert.equal(step.reason, "legacy_auto_narration_suspended");

  const seed = await nemo.seedNemoAutogenBackfillQueue({ limitEpisodes: 5 });
  assert.equal(seed.status, "suspended");
  assert.equal(seed.seededPendingCount, 0);
  assert.equal(seed.scannedEpisodeCount, 0);

  const aivisStep = await aivis.runNextPendingAivisAutogenJob({
    officialUserId: "00000000-0000-4000-8000-000000000001",
  });
  assert.equal(aivisStep.status, "skipped");
  assert.equal(aivisStep.reason, "legacy_auto_narration_suspended");
  assert.equal(
    globalThis.__libreadAivisAutogenRunning,
    undefined,
    "suspended Aivis autogen must not take the in-process run lock"
  );
  assert.equal(
    globalThis.__libreadNemoAutogenRunning,
    undefined,
    "suspended Nemo autogen must not take the in-process run lock"
  );

  // Manual Nemo/Aivis generation is suspended too (owner decision 2026-11-07):
  // the library entrypoints must throw before any Supabase or TTS access.
  const { AI_NARRATION_GENERATION_SUSPENDED } = await import(
    "../src/lib/recording/legacyAutoNarration"
  );
  assert.equal(AI_NARRATION_GENERATION_SUSPENDED, true);
  const nemoManual = await import("../src/lib/recording/nemoGeneration");
  const aivisManual = await import("../src/lib/recording/aivisGeneration");
  const manualInput = {
    supabase: {} as never,
    userId: "00000000-0000-4000-8000-000000000001",
    seriesId: "series-1",
    episodeId: "episode-1",
    narratorName: "test",
    speakerId: 1,
  };
  await assert.rejects(
    () => nemoManual.generateNemoRecordingForEpisode(manualInput as never),
    /ai_narration_generation_suspended/
  );
  await assert.rejects(
    () => aivisManual.generateAivisRecordingForEpisode(manualInput as never),
    /ai_narration_generation_suspended/
  );

  assert.equal(networkCalls, 0, "suspended autogen must not contact Supabase or TTS");

  // Route-level contract: every API route that imports a legacy autogen entry
  // must check the suspension flag before invoking it.
  const AUTOGEN_ENTRIES = [
    "runNextPendingNemoAutogenJob",
    "seedNemoAutogenBackfillQueue",
    "runNemoAutoGenerationStep",
    "runNextPendingAivisAutogenJob",
  ];
  const routeFiles: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (name === "route.ts") routeFiles.push(path);
    }
  };
  walk("src/app");

  let guardedRoutes = 0;
  for (const file of routeFiles) {
    const text = readFileSync(file, "utf8").replace(/\r\n/g, "\n");
    for (const entry of AUTOGEN_ENTRIES) {
      const callIndex = text.indexOf(`${entry}(`);
      if (callIndex < 0) continue;
      const guardIndex = text.indexOf("if (LEGACY_AUTO_NARRATION_SUSPENDED)");
      assert.ok(
        guardIndex >= 0 && guardIndex < callIndex,
        `${file} calls ${entry} without a preceding LEGACY_AUTO_NARRATION_SUSPENDED guard`
      );
      guardedRoutes += 1;
    }
  }
  // Manual generation routes: the suspension guard must precede the call.
  const MANUAL_ROUTES: Array<[string, string]> = [
    ["src/app/api/recordings/nemo-generate/route.ts", "generateNemoRecordingForEpisode("],
    ["src/app/api/recordings/aivis-generate/route.ts", "generateAivisRecordingForEpisode("],
  ];
  for (const [file, call] of MANUAL_ROUTES) {
    const text = readFileSync(file, "utf8").replace(/\r\n/g, "\n");
    const guardIndex = text.indexOf("if (AI_NARRATION_GENERATION_SUSPENDED)");
    const callIndex = text.indexOf(call);
    assert.ok(callIndex >= 0, `${file} no longer calls ${call}; update this test`);
    assert.ok(
      guardIndex >= 0 && guardIndex < callIndex,
      `${file} calls ${call} without a preceding AI_NARRATION_GENERATION_SUSPENDED guard`
    );
  }

  assert.equal(
    guardedRoutes,
    4,
    "expected exactly the 4 known legacy autogen routes; update this test when the set changes"
  );

  globalThis.fetch = originalFetch;
  console.log(
    `PASS: legacy auto narration suspension — 4 library entrypoints fail closed with 0 network calls; ${guardedRoutes} routes guarded; manual Nemo/Aivis generation suspended (2 library entrypoints, 2 routes)`
  );
}

main().catch((error) => {
  globalThis.fetch = originalFetch;
  console.error(error);
  process.exit(1);
});
