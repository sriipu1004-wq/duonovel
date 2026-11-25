import assert from "node:assert/strict";
import Module from "node:module";

// Characterization test: pins current behavior only (LT-002).
// Supabase clients and the AI usage module are replaced in-process; no DB, Auth or Stripe access.

type RpcResult = { data: unknown; error: { message: string } | null };
const state = {
  userId: "user-1" as string | null,
  authThrows: false,
  unlockRow: { data: null as unknown, error: null as { message: string } | null },
  rpc: {} as Record<string, RpcResult>,
  rpcCalls: [] as Array<[string, Record<string, unknown>]>,
  unlockQueries: [] as unknown[][],
  usage: { isSubscriber: false, resetAt: "2026-11-26T00:00:00.000Z", actions: { translation_generation: { used: 1, limit: 3 } } },
  usageCalls: [] as Array<string | undefined>,
};

const adminStub = {
  createAdminClient: () => ({
    rpc: async (name: string, params: Record<string, unknown>) => {
      state.rpcCalls.push([name, params]);
      return state.rpc[name] ?? { data: null, error: { message: `unexpected ${name}` } };
    },
    from(table: string) {
      const calls: unknown[] = [table];
      state.unlockQueries.push(calls);
      const builder = {
        select: (columns: string) => (calls.push(["select", columns]), builder),
        eq: (column: string, value: unknown) => (calls.push(["eq", column, value]), builder),
        ilike: (column: string, value: unknown) => (calls.push(["ilike", column, value]), builder),
        limit: (count: number) => (calls.push(["limit", count]), builder),
        maybeSingle: async () => state.unlockRow,
      };
      return builder;
    },
  }),
};
const serverStub = {
  createClient: async () => ({
    auth: {
      getUser: async () => {
        if (state.authThrows) throw new Error("auth down");
        return { data: { user: state.userId ? { id: state.userId } : null }, error: null };
      },
    },
  }),
};
const aiUsageStub = {
  getAiUsageSnapshot: async (_request: Request, userId?: string) => {
    state.usageCalls.push(userId);
    return state.usage;
  },
  getPublicTranslationDailyLimits: () => ({ free: 3, subscriber: 30 }),
};

const moduleWithLoad = Module as unknown as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown;
};
const originalLoad = moduleWithLoad._load;
moduleWithLoad._load = function (request, parent, isMain) {
  if (request === "server-only") return {};
  if (request === "@/lib/supabase/admin" || request.endsWith("/lib/supabase/admin")) return adminStub;
  if (request === "@/lib/supabase/server" || request.endsWith("/lib/supabase/server")) return serverStub;
  if (request === "@/lib/aiUsage/aiUsage.server" || request.endsWith("/lib/aiUsage/aiUsage.server")) return aiUsageStub;
  return originalLoad.call(this, request, parent, isMain);
};

const env = process.env as Record<string, string | undefined>;
const savedFlag = env.PUBLIC_TRANSLATION_CREDITS_ENABLED;
const request = new Request("https://app.invalid/api/episode-translations/generate");

async function main() {
  try {
    const credits = await import("../src/lib/translation/publicTranslationCredits.server");

    // Feature flag (default off).
    delete env.PUBLIC_TRANSLATION_CREDITS_ENABLED;
    assert.equal(credits.isPublicTranslationCreditsEnabled(), false);
    assert.equal(await credits.getPublicTranslationEntitlementState({ request, episodeId: "ep-1", targetLanguage: "en" }), null);
    assert.equal(await credits.getAuthenticatedCreditBalance(), null);
    for (const value of ["true", "1", "YES", "on"]) {
      env.PUBLIC_TRANSLATION_CREDITS_ENABLED = value;
      assert.equal(credits.isPublicTranslationCreditsEnabled(), true, value);
    }
    env.PUBLIC_TRANSLATION_CREDITS_ENABLED = "maybe";
    assert.equal(credits.isPublicTranslationCreditsEnabled(), false);
    env.PUBLIC_TRANSLATION_CREDITS_ENABLED = "true";

    // Auto generation only for unlocked/included states (or when credits are off).
    assert.equal(credits.publicTranslationCanAutoGenerate(null), true);
    const sample = { enabled: true as const, isSubscriber: false, dailyUsed: 0, dailyLimit: 0, creditBalance: 0, resetAt: "" };
    assert.equal(credits.publicTranslationCanAutoGenerate({ ...sample, status: "unlocked" }), true);
    assert.equal(credits.publicTranslationCanAutoGenerate({ ...sample, status: "included_available" }), true);
    assert.equal(credits.publicTranslationCanAutoGenerate({ ...sample, status: "credit_required" }), false);
    assert.equal(credits.publicTranslationCanAutoGenerate({ ...sample, status: "login_required" }), false);

    // Signed out (or auth failure): login_required without any DB access.
    state.userId = null;
    assert.deepEqual(await credits.getPublicTranslationEntitlementState({ request, episodeId: "ep-1", targetLanguage: "en" }), {
      enabled: true,
      status: "login_required",
      isSubscriber: false,
      dailyUsed: 0,
      dailyLimit: 0,
      creditBalance: 0,
      resetAt: "",
    });
    state.authThrows = true;
    assert.equal((await credits.getPublicTranslationEntitlementState({ request, episodeId: "ep-1", targetLanguage: "en" }))?.status, "login_required");
    state.authThrows = false;
    assert.equal(state.rpcCalls.length + state.unlockQueries.length, 0);

    // Signed in: balance refresh, unlock lookup and daily usage.
    state.userId = "user-1";
    state.rpc.refresh_credit_expirations = { data: "2", error: null };
    const included = await credits.getPublicTranslationEntitlementState({ request, episodeId: "ep-1", targetLanguage: " EN " });
    assert.deepEqual(included, {
      enabled: true,
      status: "included_available",
      isSubscriber: false,
      dailyUsed: 1,
      dailyLimit: 3,
      creditBalance: 2,
      resetAt: "2026-11-26T00:00:00.000Z",
    });
    assert.deepEqual(state.unlockQueries.at(-1), [
      "public_episode_translation_unlocks",
      ["select", "id"],
      ["eq", "user_id", "user-1"],
      ["eq", "episode_id", "ep-1"],
      ["ilike", "target_language", "EN"],
      ["limit", 1],
    ]);
    assert.deepEqual(state.rpcCalls.at(-1), ["refresh_credit_expirations", { p_user_id: "user-1" }]);
    assert.deepEqual(state.usageCalls.at(-1), "user-1");

    state.unlockRow = { data: { id: "unlock-1" }, error: null };
    assert.equal((await credits.getPublicTranslationEntitlementState({ request, episodeId: "ep-1", targetLanguage: "en" }))?.status, "unlocked");
    state.unlockRow = { data: null, error: null };
    state.usage = { ...state.usage, actions: { translation_generation: { used: 3, limit: 3 } } };
    assert.equal((await credits.getPublicTranslationEntitlementState({ request, episodeId: "ep-1", targetLanguage: "en" }))?.status, "credit_required");
    state.rpc.refresh_credit_expirations = { data: 0, error: null };
    assert.equal((await credits.getPublicTranslationEntitlementState({ request, episodeId: "ep-1", targetLanguage: "en" }))?.status, "purchase_required");

    state.unlockRow = { data: null, error: { message: "denied" } };
    await assert.rejects(
      credits.getPublicTranslationEntitlementState({ request, episodeId: "ep-1", targetLanguage: "en" }),
      /翻訳の解放状態を取得できませんでした: denied/
    );
    state.unlockRow = { data: null, error: null };
    state.rpc.refresh_credit_expirations = { data: null, error: { message: "rpc down" } };
    await assert.rejects(credits.getAuthenticatedCreditBalance(), /クレジット有効期限の反映に失敗しました: rpc down/);
    state.rpc.refresh_credit_expirations = { data: "7", error: null };
    assert.equal(await credits.getAuthenticatedCreditBalance(), 7);

    // Included (daily allowance) unlock.
    state.rpc.unlock_public_episode_translation_included = {
      data: [{ allowed: true, result_type: "included", consumed_allowance: true, used_count: "2", limit_count: 3 }],
      error: null,
    };
    assert.deepEqual(
      await credits.finalizePublicTranslationIncludedUnlock({ request, episodeId: "ep-1", sourceLanguage: "ja", targetLanguage: "en" }),
      { allowed: true, resultType: "included", consumedAllowance: true, used: 2, limit: 3 }
    );
    const includedParams = state.rpcCalls.at(-1)![1];
    assert.equal(typeof includedParams.p_request_id, "string");
    assert.deepEqual({ ...includedParams, p_request_id: "<uuid>" }, {
      p_user_id: "user-1",
      p_episode_id: "ep-1",
      p_source_language: "ja",
      p_target_language: "en",
      p_request_id: "<uuid>",
      p_free_daily_limit: 3,
      p_subscriber_daily_limit: 30,
    });
    state.rpc.unlock_public_episode_translation_included = { data: null, error: null };
    assert.deepEqual(
      await credits.finalizePublicTranslationIncludedUnlock({ request, episodeId: "ep-1", sourceLanguage: "ja", targetLanguage: "en" }),
      { allowed: false, resultType: "unknown", consumedAllowance: false, used: 0, limit: 0 }
    );

    // Credit unlock with an idempotency key per user/episode/language.
    state.rpc.unlock_public_episode_translation = { data: { allowed: true, result_type: "charged", charged: true, balance_after: 4 }, error: null };
    assert.deepEqual(
      await credits.finalizePublicTranslationCreditUnlock({ episodeId: "ep-1", sourceLanguage: "ja", targetLanguage: " EN " }),
      { allowed: true, resultType: "charged", charged: true, balanceAfter: 4 }
    );
    assert.equal(state.rpcCalls.at(-1)![1].p_idempotency_key, "reader_unlock:user-1:ep-1:en");
    state.rpc.unlock_public_episode_translation = { data: null, error: { message: "insufficient" } };
    await assert.rejects(
      credits.finalizePublicTranslationCreditUnlock({ episodeId: "ep-1", sourceLanguage: "ja", targetLanguage: "en" }),
      /クレジットによる翻訳解放に失敗しました: insufficient/
    );

    // Signed out unlocks.
    state.userId = null;
    assert.deepEqual(
      await credits.finalizePublicTranslationIncludedUnlock({ request, episodeId: "ep-1", sourceLanguage: "ja", targetLanguage: "en" }),
      { allowed: false, resultType: "login_required" }
    );
    assert.deepEqual(
      await credits.finalizePublicTranslationCreditUnlock({ episodeId: "ep-1", sourceLanguage: "ja", targetLanguage: "en" }),
      { allowed: false, resultType: "login_required", balanceAfter: 0 }
    );
    assert.equal(await credits.getAuthenticatedCreditBalance(), null);
  } finally {
    if (savedFlag === undefined) delete env.PUBLIC_TRANSLATION_CREDITS_ENABLED;
    else env.PUBLIC_TRANSLATION_CREDITS_ENABLED = savedFlag;
    moduleWithLoad._load = originalLoad;
  }

  console.log("PASS: public translation credits server (flag, entitlement states, balance refresh, included/credit unlock RPCs)");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
