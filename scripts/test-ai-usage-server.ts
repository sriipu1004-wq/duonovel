import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import Module from "node:module";

// Characterization test: pins current behavior only (LT-002).
// Supabase clients and the official-account entitlement are replaced in-process. No DB access;
// env values are fake placeholders set only inside this process.

type Rpc = { data: unknown; error: { message: string } | null };
const state = {
  authUserId: null as string | null,
  entitlement: { data: null as unknown, error: null as { message: string } | null },
  officialEntitled: false,
  rpc: new Map<string, Rpc[]>(),
  rpcCalls: [] as Array<[string, Record<string, unknown>]>,
};
function queue(name: string, ...results: Rpc[]) {
  state.rpc.set(name, [...(state.rpc.get(name) ?? []), ...results]);
}

const adminStub = {
  createAdminClient: () => ({
    rpc: async (name: string, params: Record<string, unknown>) => {
      state.rpcCalls.push([name, params]);
      return state.rpc.get(name)?.shift() ?? { data: null, error: null };
    },
    from(table: string) {
      assert.equal(table, "libread_user_entitlements");
      const builder = { select: () => builder, eq: () => builder, maybeSingle: async () => state.entitlement };
      return builder;
    },
  }),
};

const moduleWithLoad = Module as unknown as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown;
};
const originalLoad = moduleWithLoad._load;
moduleWithLoad._load = function (request, parent, isMain) {
  if (request === "server-only") return {};
  if (request === "@/lib/supabase/admin" || request.endsWith("/lib/supabase/admin")) return adminStub;
  if (request === "@/lib/supabase/server" || request.endsWith("/lib/supabase/server")) {
    return { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: state.authUserId ? { id: state.authUserId } : null } }) } }) };
  }
  if (request === "@/lib/auth/officialAccount.server" || request.endsWith("/lib/auth/officialAccount.server")) {
    return { ensureOfficialSubscriberEntitlement: async () => state.officialEntitled };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const env = process.env as Record<string, string | undefined>;
const NAMES = ["IP_HASH_SALT", "LIBREAD_SUBSCRIBER_TRANSLATION_DAILY_LIMIT", "LIBREAD_FREE_WORD_DAILY_LIMIT", "LIBREAD_SUBSCRIBER_WORD_DAILY_LIMIT"];
const saved = Object.fromEntries(NAMES.map((name) => [name, env[name]]));

const requestFrom = (headers: Record<string, string>) => new Request("https://app.invalid/api/x", { headers });
const keyFor = (ip: string) => createHash("sha256").update(`fixture-salt:${ip}`).digest("hex");

async function main() {
  for (const name of NAMES) delete env[name];
  env.IP_HASH_SALT = "fixture-salt";
  const originalError = console.error;
  console.error = () => {};
  try {
    const usage = await import("../src/lib/aiUsage/aiUsage.server");

    assert.equal(usage.FREE_TRANSLATION_DAILY_LIMIT, 3);
    assert.deepEqual(usage.getPublicTranslationDailyLimits(), { free: 3, subscriber: 30 });

    // Identity: forwarded IP precedence and salted hash; user from Auth unless given.
    const identity = await usage.resolveAiUsageIdentity(
      requestFrom({ "x-forwarded-for": " 198.51.100.7, 10.0.0.1", "x-real-ip": "192.0.2.1" })
    );
    assert.deepEqual(identity, { userId: null, anonymousKey: keyFor("198.51.100.7") });
    assert.equal((await usage.resolveAiUsageIdentity(requestFrom({ "cf-connecting-ip": "192.0.2.9", "x-real-ip": "192.0.2.1" }))).anonymousKey, keyFor("192.0.2.9"));
    assert.equal((await usage.resolveAiUsageIdentity(requestFrom({}))).anonymousKey, keyFor("unknown"));
    state.authUserId = "auth-user";
    assert.equal((await usage.resolveAiUsageIdentity(requestFrom({}))).userId, "auth-user");
    assert.equal((await usage.resolveAiUsageIdentity(requestFrom({}), null)).userId, null, "explicit null skips Auth");
    assert.equal((await usage.resolveAiUsageIdentity(requestFrom({}), "given")).userId, "given");
    state.authUserId = null;

    // isSubscriber: entitlement row, expiry, then official-account fallback.
    state.entitlement = { data: { plan_type: "subscriber", subscriber_until: null }, error: null };
    assert.equal(await usage.isSubscriber("u"), true);
    state.entitlement = { data: { plan_type: "subscriber", subscriber_until: new Date(Date.now() + 60_000).toISOString() }, error: null };
    assert.equal(await usage.isSubscriber("u"), true);
    state.entitlement = { data: { plan_type: "subscriber", subscriber_until: "2000-01-01T00:00:00Z" }, error: null };
    assert.equal(await usage.isSubscriber("u"), false);
    state.officialEntitled = true;
    assert.equal(await usage.isSubscriber("u"), true);
    state.officialEntitled = false;
    state.entitlement = { data: null, error: null };

    // Free daily reservation.
    queue("reserve_libread_daily_ai_action", { data: [{ allowed: true, used_count: "1", limit_count: 3, plan_type: "free", reset_at: "R" }], error: null });
    assert.deepEqual(
      await usage.reserveAiAction({ request: requestFrom({ "x-real-ip": "192.0.2.1" }), requestId: "req-1", actionType: "translation_generation", userId: "u" }),
      { allowed: true, used: 1, limit: 3, plan: "free", resetAt: "R" }
    );
    assert.deepEqual(state.rpcCalls.at(-1), [
      "reserve_libread_daily_ai_action",
      { p_request_id: "req-1", p_user_id: "u", p_anonymous_key: keyFor("192.0.2.1"), p_action_type: "translation_generation", p_free_limit: 3, p_subscriber_limit: 30 },
    ]);
    queue("reserve_libread_daily_ai_action", { data: null, error: { message: "boom" } });
    await assert.rejects(usage.reserveAiAction({ request: requestFrom({}), requestId: "r", actionType: "library_import", userId: null }), /AI利用回数の予約に失敗しました: boom/);
    queue("reserve_libread_daily_ai_action", { data: [{}], error: null });
    await assert.rejects(usage.reserveAiAction({ request: requestFrom({}), requestId: "r", actionType: "library_import", userId: null }), /予約結果を読み取れませんでした/);

    // Subscriber: daily reservation then monthly budget; budget refusal releases the daily slot.
    state.entitlement = { data: { plan_type: "subscriber", subscriber_until: null }, error: null };
    state.rpcCalls = [];
    queue("reserve_libread_daily_ai_action", { data: { allowed: true, used_count: 4, limit_count: 30, plan_type: "subscriber", reset_at: "R" }, error: null });
    queue("reserve_libread_subscriber_monthly_ai_budget", { data: { allowed: false, used_cost_jpy: 299, limit_cost_jpy: 300 }, error: null });
    const refused = await usage.reserveAiAction({ request: requestFrom({}), requestId: "req-2", actionType: "translation_generation", userId: "sub" });
    assert.deepEqual(refused, {
      allowed: false,
      used: 4,
      limit: 30,
      plan: "subscriber",
      resetAt: "R",
      limitReason: "subscriber_monthly_budget",
      monthlyBudgetUsed: 299,
      monthlyBudgetLimit: 300,
    });
    assert.deepEqual(state.rpcCalls.map((call) => call[0]), [
      "reserve_libread_daily_ai_action",
      "reserve_libread_subscriber_monthly_ai_budget",
      "release_libread_daily_ai_action",
    ]);
    assert.deepEqual(state.rpcCalls[1]![1], { p_request_id: "req-2", p_user_id: "sub", p_action_type: "translation_generation", p_reserved_cost_jpy: 8, p_monthly_limit_jpy: 300 });

    // Subscriber word explanations use only the monthly budget (no daily count).
    state.rpcCalls = [];
    queue("reserve_libread_subscriber_monthly_ai_budget", { data: [{ allowed: true }], error: null });
    assert.deepEqual(
      await usage.reserveAiAction({ request: requestFrom({}), requestId: "req-3", actionType: "word_explanation", userId: "sub" }),
      { allowed: true, used: 0, limit: -1, plan: "subscriber", resetAt: "" }
    );
    assert.deepEqual(state.rpcCalls.map((call) => [call[0], call[1].p_reserved_cost_jpy]), [["reserve_libread_subscriber_monthly_ai_budget", 0.05]]);

    // reserveSubscriberAiCostOnly.
    assert.deepEqual(await usage.reserveSubscriberAiCostOnly({ requestId: "r", userId: null, actionType: "translation_generation" }), { allowed: true, plan: "free" });
    assert.deepEqual(await usage.reserveSubscriberAiCostOnly({ requestId: "r", userId: "sub", actionType: "library_import" }), { allowed: true, plan: "subscriber" });
    queue("reserve_libread_subscriber_monthly_ai_budget", { data: { allowed: false, used_cost_jpy: 300, limit_cost_jpy: 300 }, error: null });
    assert.deepEqual(await usage.reserveSubscriberAiCostOnly({ requestId: "r", userId: "sub", actionType: "translation_generation" }), {
      allowed: false,
      plan: "subscriber",
      limitReason: "subscriber_monthly_budget",
      monthlyBudgetUsed: 300,
      monthlyBudgetLimit: 300,
    });
    state.entitlement = { data: null, error: null };
    assert.deepEqual(await usage.reserveSubscriberAiCostOnly({ requestId: "r", userId: "free-user", actionType: "translation_generation" }), { allowed: true, plan: "free" });

    // Release both buckets; errors are only logged.
    state.rpcCalls = [];
    queue("release_libread_daily_ai_action", { data: null, error: { message: "x" } });
    await usage.releaseAiAction("req-9");
    assert.deepEqual(state.rpcCalls.map((call) => call[0]).sort(), ["release_libread_daily_ai_action", "release_libread_subscriber_monthly_ai_budget"]);

    // Messages.
    assert.equal(usage.aiActionLimitMessage({ used: 3, limit: 3 }, "翻訳"), "本日の翻訳回数（3/3）を使い切りました。");
    assert.equal(
      usage.aiActionLimitMessage({ used: 0, limit: -1, limitReason: "subscriber_monthly_budget", monthlyBudgetUsed: 299 }, "翻訳"),
      "今月のサブスクAI利用上限（原価299/300円相当）に達しました。来月1日に再開します。"
    );

    // Snapshot: legacy story_generation key maps to library_import; unknown actions are ignored.
    queue("get_libread_daily_ai_usage", {
      data: [
        { action_type: "story_generation", used_count: 2, limit_count: 3, plan_type: "free", reset_at: "R1" },
        { action_type: "translation_generation", used_count: 1, limit_count: 3 },
        { action_type: "retired_thing", used_count: 9, limit_count: 9 },
      ],
      error: null,
    });
    assert.deepEqual(await usage.getAiUsageSnapshot(requestFrom({}), null), {
      plan: "free",
      isSubscriber: false,
      resetAt: "R1",
      actions: {
        library_import: { used: 2, limit: 3 },
        translation_generation: { used: 1, limit: 3 },
        word_explanation: { used: 0, limit: 20 },
      },
    });
    const snapshotCall = state.rpcCalls.at(-1)![1];
    assert.deepEqual({ ...snapshotCall, p_anonymous_key: "<hash>" }, {
      p_user_id: null,
      p_anonymous_key: "<hash>",
      p_free_story_limit: 3,
      p_subscriber_story_limit: -1,
      p_free_translation_limit: 3,
      p_subscriber_translation_limit: 30,
      p_free_word_limit: 20,
      p_subscriber_word_limit: 100,
    });
    state.entitlement = { data: { plan_type: "subscriber", subscriber_until: null }, error: null };
    queue("get_libread_daily_ai_usage", { data: [], error: null });
    const subscriberSnapshot = await usage.getAiUsageSnapshot(requestFrom({}), "sub");
    assert.equal(subscriberSnapshot.plan, "subscriber");
    assert.deepEqual(subscriberSnapshot.actions.word_explanation, { used: 0, limit: -1 });
    queue("get_libread_daily_ai_usage", { data: null, error: { message: "down" } });
    await assert.rejects(usage.getAiUsageSnapshot(requestFrom({}), null), /AI利用回数を取得できませんでした: down/);
  } finally {
    console.error = originalError;
    for (const name of NAMES) {
      if (saved[name] === undefined) delete env[name];
      else env[name] = saved[name];
    }
    moduleWithLoad._load = originalLoad;
  }

  console.log("PASS: AI usage server (identity hashing, subscriber check, daily/monthly reservations, release, messages, snapshot)");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
