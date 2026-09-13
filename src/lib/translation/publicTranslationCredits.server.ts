import "server-only";

import { randomUUID } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  getAiUsageSnapshot,
  getPublicTranslationDailyLimits,
} from "@/lib/aiUsage/aiUsage.server";
import {
  resolveTranslationCreditPolicy,
  type TranslationCreditPolicyStatus,
} from "@/lib/translation/publicTranslationCreditPolicy";

export type PublicTranslationEntitlementStatus = TranslationCreditPolicyStatus;

export type PublicTranslationEntitlementState = {
  enabled: true;
  status: PublicTranslationEntitlementStatus;
  isSubscriber: boolean;
  dailyUsed: number;
  dailyLimit: number;
  creditBalance: number;
  resetAt: string;
};

function readBooleanEnv(name: string, fallback = false): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  if (!value) return fallback;
  if (["true", "1", "yes", "on"].includes(value)) return true;
  if (["false", "0", "no", "off"].includes(value)) return false;
  return fallback;
}

export function isPublicTranslationCreditsEnabled(): boolean {
  return readBooleanEnv("PUBLIC_TRANSLATION_CREDITS_ENABLED", false);
}

export function publicTranslationCanAutoGenerate(
  state: PublicTranslationEntitlementState | null
): boolean {
  if (!state) return true;
  return state.status === "unlocked" || state.status === "included_available";
}

async function currentUserId(): Promise<string | null> {
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    return data.user?.id ?? null;
  } catch {
    return null;
  }
}

async function getBalance(userId: string): Promise<number> {
  const admin = createAdminClient();
  // Purchased-credit expiration is lazy by design. Refresh it before every
  // user-facing balance/entitlement read so expired lots are never shown as
  // spendable simply because the account has not unlocked anything recently.
  const { data, error } = await admin.rpc("refresh_credit_expirations", {
    p_user_id: userId,
  });
  if (error) {
    throw new Error(`クレジット有効期限の反映に失敗しました: ${error.message}`);
  }
  return Number(data ?? 0);
}

export async function getPublicTranslationEntitlementState(args: {
  request: Request;
  episodeId: string;
  targetLanguage: string;
}): Promise<PublicTranslationEntitlementState | null> {
  if (!isPublicTranslationCreditsEnabled()) return null;

  const userId = await currentUserId();
  if (!userId) {
    return {
      enabled: true,
      status: resolveTranslationCreditPolicy({
        authenticated: false,
        alreadyUnlocked: false,
        dailyUsed: 0,
        dailyLimit: 0,
        creditBalance: 0,
      }),
      isSubscriber: false,
      dailyUsed: 0,
      dailyLimit: 0,
      creditBalance: 0,
      resetAt: "",
    };
  }

  const admin = createAdminClient();
  const [unlockResult, usage, creditBalance] = await Promise.all([
    admin
      .from("public_episode_translation_unlocks")
      .select("id")
      .eq("user_id", userId)
      .eq("episode_id", args.episodeId)
      .ilike("target_language", args.targetLanguage.trim())
      .limit(1)
      .maybeSingle(),
    getAiUsageSnapshot(args.request, userId),
    getBalance(userId),
  ]);

  if (unlockResult.error) {
    throw new Error(`翻訳の解放状態を取得できませんでした: ${unlockResult.error.message}`);
  }

  const daily = usage.actions.translation_generation;
  return {
    enabled: true,
    status: resolveTranslationCreditPolicy({
      authenticated: true,
      alreadyUnlocked: Boolean(unlockResult.data?.id),
      dailyUsed: daily.used,
      dailyLimit: daily.limit,
      creditBalance,
    }),
    isSubscriber: usage.isSubscriber,
    dailyUsed: daily.used,
    dailyLimit: daily.limit,
    creditBalance,
    resetAt: usage.resetAt,
  };
}

export async function finalizePublicTranslationIncludedUnlock(args: {
  request: Request;
  episodeId: string;
  sourceLanguage: string;
  targetLanguage: string;
}) {
  const userId = await currentUserId();
  if (!userId) {
    return { allowed: false as const, resultType: "login_required" as const };
  }

  await getAiUsageSnapshot(args.request, userId);
  const limits = getPublicTranslationDailyLimits();
  const admin = createAdminClient();
  const { data, error } = await admin.rpc(
    "unlock_public_episode_translation_included",
    {
      p_user_id: userId,
      p_episode_id: args.episodeId,
      p_source_language: args.sourceLanguage,
      p_target_language: args.targetLanguage,
      p_request_id: randomUUID(),
      p_free_daily_limit: limits.free,
      p_subscriber_daily_limit: limits.subscriber,
    }
  );
  if (error) throw new Error(`翻訳の無料枠解放に失敗しました: ${error.message}`);
  const row = Array.isArray(data) ? data[0] : data;
  return {
    allowed: row?.allowed === true,
    resultType: String(row?.result_type ?? "unknown"),
    consumedAllowance: row?.consumed_allowance === true,
    used: Number(row?.used_count ?? 0),
    limit: Number(row?.limit_count ?? 0),
  };
}

export async function finalizePublicTranslationCreditUnlock(args: {
  episodeId: string;
  sourceLanguage: string;
  targetLanguage: string;
}) {
  const userId = await currentUserId();
  if (!userId) {
    return {
      allowed: false as const,
      resultType: "login_required" as const,
      balanceAfter: 0,
    };
  }

  const admin = createAdminClient();
  const idempotencyKey = [
    "reader_unlock",
    userId,
    args.episodeId,
    args.targetLanguage.trim().toLowerCase(),
  ].join(":");
  const { data, error } = await admin.rpc("unlock_public_episode_translation", {
    p_user_id: userId,
    p_episode_id: args.episodeId,
    p_source_language: args.sourceLanguage,
    p_target_language: args.targetLanguage,
    p_idempotency_key: idempotencyKey,
  });
  if (error) throw new Error(`クレジットによる翻訳解放に失敗しました: ${error.message}`);
  const row = Array.isArray(data) ? data[0] : data;
  return {
    allowed: row?.allowed === true,
    resultType: String(row?.result_type ?? "unknown"),
    charged: row?.charged === true,
    balanceAfter: Number(row?.balance_after ?? 0),
  };
}

export async function getAuthenticatedCreditBalance(): Promise<number | null> {
  if (!isPublicTranslationCreditsEnabled()) return null;
  const userId = await currentUserId();
  if (!userId) return null;
  return getBalance(userId);
}
