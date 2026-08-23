import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  DEFAULT_TRANSLATION_SOURCE_LANGUAGE,
  DEFAULT_TRANSLATION_TARGET_LANGUAGE,
  type SupportedLanguageTag,
} from "@/lib/translation/languageRegistry";

type AdminSupabase = ReturnType<typeof createAdminClient>;

type ReservationRpcError = {
  code?: string;
  message?: string;
};

type SharedReservationArgs = {
  admin: AdminSupabase;
  requestId: string;
  sourceHash: string;
  sourceLanguage: SupportedLanguageTag;
  targetLanguage: SupportedLanguageTag;
  userId: string | null;
  model: string;
  sourceChars: number;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  costEstimateJpy: number;
  dailyMaxRequests: number;
  dailyMaxEstimatedCostJpy: number;
};

function canUseLegacyReservation(args: {
  sourceLanguage: SupportedLanguageTag;
  targetLanguage: SupportedLanguageTag;
  error: ReservationRpcError;
}): boolean {
  if (
    args.sourceLanguage !== DEFAULT_TRANSLATION_SOURCE_LANGUAGE ||
    args.targetLanguage !== DEFAULT_TRANSLATION_TARGET_LANGUAGE
  ) {
    return false;
  }

  const message = args.error.message ?? "";
  return (
    args.error.code === "PGRST202" ||
    args.error.code === "42883" ||
    message.includes("Could not find the function") ||
    message.includes("does not exist")
  );
}

export async function reserveEpisodeTranslation(
  args: SharedReservationArgs & { episodeId: string }
) {
  const v2Result = await args.admin.rpc("reserve_episode_translation_v2", {
    p_request_id: args.requestId,
    p_episode_id: args.episodeId,
    p_source_hash: args.sourceHash,
    p_source_language: args.sourceLanguage,
    p_target_language: args.targetLanguage,
    p_user_id: args.userId,
    p_model: args.model,
    p_source_chars: args.sourceChars,
    p_estimated_input_tokens: args.estimatedInputTokens,
    p_estimated_output_tokens: args.estimatedOutputTokens,
    p_cost_estimate_jpy: args.costEstimateJpy,
    p_daily_max_requests: args.dailyMaxRequests,
    p_daily_max_estimated_cost_jpy: args.dailyMaxEstimatedCostJpy,
  });

  if (
    !v2Result.error ||
    !canUseLegacyReservation({
      sourceLanguage: args.sourceLanguage,
      targetLanguage: args.targetLanguage,
      error: v2Result.error,
    })
  ) {
    return v2Result;
  }

  return args.admin.rpc("reserve_episode_translation", {
    p_request_id: args.requestId,
    p_episode_id: args.episodeId,
    p_source_hash: args.sourceHash,
    p_target_language: args.targetLanguage,
    p_user_id: args.userId,
    p_model: args.model,
    p_source_chars: args.sourceChars,
    p_estimated_input_tokens: args.estimatedInputTokens,
    p_estimated_output_tokens: args.estimatedOutputTokens,
    p_cost_estimate_jpy: args.costEstimateJpy,
    p_daily_max_requests: args.dailyMaxRequests,
    p_daily_max_estimated_cost_jpy: args.dailyMaxEstimatedCostJpy,
  });
}

export async function reserveGeneratedStoryTranslation(
  args: SharedReservationArgs & { storyId: string }
) {
  const v2Result = await args.admin.rpc(
    "reserve_generated_story_translation_v2",
    {
      p_request_id: args.requestId,
      p_story_id: args.storyId,
      p_source_hash: args.sourceHash,
      p_source_language: args.sourceLanguage,
      p_target_language: args.targetLanguage,
      p_user_id: args.userId,
      p_model: args.model,
      p_source_chars: args.sourceChars,
      p_estimated_input_tokens: args.estimatedInputTokens,
      p_estimated_output_tokens: args.estimatedOutputTokens,
      p_cost_estimate_jpy: args.costEstimateJpy,
      p_daily_max_requests: args.dailyMaxRequests,
      p_daily_max_estimated_cost_jpy: args.dailyMaxEstimatedCostJpy,
    }
  );

  if (
    !v2Result.error ||
    !canUseLegacyReservation({
      sourceLanguage: args.sourceLanguage,
      targetLanguage: args.targetLanguage,
      error: v2Result.error,
    })
  ) {
    return v2Result;
  }

  return args.admin.rpc("reserve_generated_story_translation", {
    p_request_id: args.requestId,
    p_story_id: args.storyId,
    p_source_hash: args.sourceHash,
    p_target_language: args.targetLanguage,
    p_user_id: args.userId,
    p_model: args.model,
    p_source_chars: args.sourceChars,
    p_estimated_input_tokens: args.estimatedInputTokens,
    p_estimated_output_tokens: args.estimatedOutputTokens,
    p_cost_estimate_jpy: args.costEstimateJpy,
    p_daily_max_requests: args.dailyMaxRequests,
    p_daily_max_estimated_cost_jpy: args.dailyMaxEstimatedCostJpy,
  });
}
