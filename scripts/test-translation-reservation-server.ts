import assert from "node:assert/strict";
import Module from "node:module";

// Characterization test: pins current behavior only (LT-002). The admin client is a fake passed in.

const moduleWithLoad = Module as unknown as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown;
};
const originalLoad = moduleWithLoad._load;
moduleWithLoad._load = function (request, parent, isMain) {
  if (request === "server-only") return {};
  if (request === "@/lib/supabase/admin" || request.endsWith("/lib/supabase/admin")) return { createAdminClient: () => ({}) };
  return originalLoad.call(this, request, parent, isMain);
};

type RpcResult = { data: unknown; error: { code?: string; message?: string } | null };

function fakeAdmin(results: Record<string, RpcResult>) {
  const calls: Array<[string, Record<string, unknown>]> = [];
  return {
    calls,
    admin: {
      rpc: async (name: string, params: Record<string, unknown>) => {
        calls.push([name, params]);
        return results[name] ?? { data: null, error: { message: `unexpected ${name}` } };
      },
    },
  };
}

const base = {
  requestId: "req-1",
  sourceHash: "hash-1",
  userId: "user-1",
  model: "model-x",
  sourceChars: 100,
  estimatedInputTokens: 10,
  estimatedOutputTokens: 20,
  costEstimateJpy: 1.5,
  dailyMaxRequests: 50,
  dailyMaxEstimatedCostJpy: 300,
};

async function main() {
  try {
    const server = await import("../src/lib/translation/translationReservationServer");
    type Admin = Parameters<typeof server.reserveEpisodeTranslation>[0]["admin"];
    const missingFunction = { data: null, error: { code: "PGRST202", message: "Could not find the function" } };

    // v2 success: no legacy call; v2 parameters include the source language.
    let fake = fakeAdmin({ reserve_episode_translation_v2: { data: { ok: true }, error: null } });
    assert.deepEqual(
      await server.reserveEpisodeTranslation({ ...base, admin: fake.admin as unknown as Admin, episodeId: "ep-1", sourceLanguage: "ja", targetLanguage: "ko" }),
      { data: { ok: true }, error: null }
    );
    assert.deepEqual(fake.calls, [
      [
        "reserve_episode_translation_v2",
        {
          p_request_id: "req-1",
          p_episode_id: "ep-1",
          p_source_hash: "hash-1",
          p_source_language: "ja",
          p_target_language: "ko",
          p_user_id: "user-1",
          p_model: "model-x",
          p_source_chars: 100,
          p_estimated_input_tokens: 10,
          p_estimated_output_tokens: 20,
          p_cost_estimate_jpy: 1.5,
          p_daily_max_requests: 50,
          p_daily_max_estimated_cost_jpy: 300,
        },
      ],
    ]);

    // Missing v2 function falls back to the legacy RPC only for ja -> en.
    for (const error of [
      { code: "PGRST202" },
      { code: "42883" },
      { message: "Could not find the function public.reserve_episode_translation_v2" },
      { message: "function does not exist" },
    ]) {
      fake = fakeAdmin({
        reserve_episode_translation_v2: { data: null, error },
        reserve_episode_translation: { data: { legacy: true }, error: null },
      });
      const result = await server.reserveEpisodeTranslation({ ...base, admin: fake.admin as unknown as Admin, episodeId: "ep-1", sourceLanguage: "ja", targetLanguage: "en" });
      assert.deepEqual(result, { data: { legacy: true }, error: null }, JSON.stringify(error));
      assert.deepEqual(fake.calls.map((call) => call[0]), ["reserve_episode_translation_v2", "reserve_episode_translation"]);
      assert.equal("p_source_language" in fake.calls[1]![1], false, "legacy RPC has no source language");
    }

    // Other language pairs or other errors return the v2 error as-is.
    fake = fakeAdmin({ reserve_episode_translation_v2: missingFunction });
    assert.deepEqual(
      await server.reserveEpisodeTranslation({ ...base, admin: fake.admin as unknown as Admin, episodeId: "ep-1", sourceLanguage: "en", targetLanguage: "ja" }),
      missingFunction
    );
    assert.equal(fake.calls.length, 1);
    const quota = { data: null, error: { code: "P0001", message: "daily limit" } };
    fake = fakeAdmin({ reserve_episode_translation_v2: quota });
    assert.deepEqual(
      await server.reserveEpisodeTranslation({ ...base, admin: fake.admin as unknown as Admin, episodeId: "ep-1", sourceLanguage: "ja", targetLanguage: "en" }),
      quota
    );
    assert.equal(fake.calls.length, 1);

    // Generated-story variant uses its own RPC names and story id.
    fake = fakeAdmin({
      reserve_generated_story_translation_v2: missingFunction,
      reserve_generated_story_translation: { data: { story: true }, error: null },
    });
    assert.deepEqual(
      await server.reserveGeneratedStoryTranslation({ ...base, admin: fake.admin as unknown as Admin, storyId: "story-1", sourceLanguage: "ja", targetLanguage: "en" }),
      { data: { story: true }, error: null }
    );
    assert.deepEqual(fake.calls.map((call) => [call[0], call[1].p_story_id]), [
      ["reserve_generated_story_translation_v2", "story-1"],
      ["reserve_generated_story_translation", "story-1"],
    ]);
  } finally {
    moduleWithLoad._load = originalLoad;
  }

  console.log("PASS: translation reservation (v2 RPC, legacy fallback only for ja->en missing function, error passthrough)");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
