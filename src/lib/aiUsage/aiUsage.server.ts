import "server-only";

import { createHash } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  AI_ACTION_TYPES,
  type AiActionType,
  type AiPlanType,
  type AiUsageSnapshot,
} from "@/lib/aiUsage/aiUsage";

function readLimit(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
}

const FREE_STORY_AND_TRANSLATION_DAILY_LIMIT = readLimit(
  "LIBREAD_FREE_STORY_AND_TRANSLATION_DAILY_LIMIT",
  5
);

const LIMITS: Record<AiActionType, { free: number; subscriber: number }> = {
  story_generation: {
    free: FREE_STORY_AND_TRANSLATION_DAILY_LIMIT,
    subscriber: readLimit("LIBREAD_SUBSCRIBER_STORY_DAILY_LIMIT", 10),
  },
  translation_generation: {
    free: FREE_STORY_AND_TRANSLATION_DAILY_LIMIT,
    subscriber: readLimit("LIBREAD_SUBSCRIBER_TRANSLATION_DAILY_LIMIT", 30),
  },
  word_explanation: {
    free: readLimit("LIBREAD_FREE_WORD_DAILY_LIMIT", 20),
    subscriber: readLimit("LIBREAD_SUBSCRIBER_WORD_DAILY_LIMIT", 100),
  },
};

type UsageIdentity = { userId: string | null; anonymousKey: string };

function forwardedIp(headers: Headers): string {
  for (const name of [
    "cf-connecting-ip",
    "x-real-ip",
    "x-forwarded-for",
    "x-vercel-forwarded-for",
  ]) {
    const value = headers.get(name)?.split(",")[0]?.trim();
    if (value) return value;
  }
  return "unknown";
}

function anonymousKey(request: Request): string {
  const salt =
    process.env.IP_HASH_SALT ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.OPENAI_API_KEY ||
    "libread-local-ai-usage";
  const userAgent = request.headers.get("user-agent")?.trim() ?? "unknown";
  return createHash("sha256")
    .update(`${salt}:${forwardedIp(request.headers)}:${userAgent}`)
    .digest("hex");
}

export async function resolveAiUsageIdentity(
  request: Request,
  knownUserId?: string | null
): Promise<UsageIdentity> {
  let userId = knownUserId ?? null;
  if (knownUserId === undefined) {
    try {
      const supabase = await createClient();
      const { data } = await supabase.auth.getUser();
      userId = data.user?.id ?? null;
    } catch {
      userId = null;
    }
  }

  return { userId, anonymousKey: anonymousKey(request) };
}

export async function reserveAiAction(args: {
  request: Request;
  requestId: string;
  actionType: AiActionType;
  userId?: string | null;
}) {
  const identity = await resolveAiUsageIdentity(args.request, args.userId);
  const limits = LIMITS[args.actionType];
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("reserve_libread_daily_ai_action", {
    p_request_id: args.requestId,
    p_user_id: identity.userId,
    p_anonymous_key: identity.anonymousKey,
    p_action_type: args.actionType,
    p_free_limit: limits.free,
    p_subscriber_limit: limits.subscriber,
  });

  if (error) throw new Error(`AI利用回数の予約に失敗しました: ${error.message}`);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row.allowed !== "boolean") {
    throw new Error("AI利用回数の予約結果を読み取れませんでした。");
  }

  return {
    allowed: row.allowed === true,
    used: Number(row.used_count ?? 0),
    limit: Number(row.limit_count ?? 0),
    plan: (row.plan_type === "subscriber" ? "subscriber" : "free") as AiPlanType,
    resetAt: String(row.reset_at ?? ""),
  };
}

export async function releaseAiAction(requestId: string): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.rpc("release_libread_daily_ai_action", {
    p_request_id: requestId,
  });
  if (error) console.error("[ai-usage-release]", error);
}

export async function getAiUsageSnapshot(
  request: Request,
  knownUserId?: string | null
): Promise<AiUsageSnapshot> {
  const identity = await resolveAiUsageIdentity(request, knownUserId);
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("get_libread_daily_ai_usage", {
    p_user_id: identity.userId,
    p_anonymous_key: identity.anonymousKey,
    p_free_story_limit: LIMITS.story_generation.free,
    p_subscriber_story_limit: LIMITS.story_generation.subscriber,
    p_free_translation_limit: LIMITS.translation_generation.free,
    p_subscriber_translation_limit: LIMITS.translation_generation.subscriber,
    p_free_word_limit: LIMITS.word_explanation.free,
    p_subscriber_word_limit: LIMITS.word_explanation.subscriber,
  });
  if (error) throw new Error(`AI利用回数を取得できませんでした: ${error.message}`);

  const actions = {
    story_generation: { used: 0, limit: LIMITS.story_generation.free },
    translation_generation: { used: 0, limit: LIMITS.translation_generation.free },
    word_explanation: { used: 0, limit: LIMITS.word_explanation.free },
  };
  let plan: AiPlanType = "free";
  let resetAt = "";

  for (const raw of data ?? []) {
    const row = raw as Record<string, unknown>;
    const action = String(row.action_type ?? "") as AiActionType;
    if (!AI_ACTION_TYPES.includes(action)) continue;
    actions[action] = {
      used: Number(row.used_count ?? 0),
      limit: Number(row.limit_count ?? 0),
    };
    if (row.plan_type === "subscriber") plan = "subscriber";
    if (typeof row.reset_at === "string") resetAt = row.reset_at;
  }

  return { plan, isSubscriber: plan === "subscriber", resetAt, actions };
}

export async function isSubscriber(userId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("libread_user_entitlements")
    .select("plan_type, subscriber_until")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || data?.plan_type !== "subscriber") return false;
  if (!data.subscriber_until) return true;
  return Date.parse(String(data.subscriber_until)) > Date.now();
}
