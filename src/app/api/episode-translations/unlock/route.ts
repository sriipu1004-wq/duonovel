import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildEpisodeTranslationSourceHash,
  resolveEpisodeTranslationAccess,
} from "@/lib/translation/episodeTranslationServer";
import {
  isPublicTranslationLanguagePair,
  parseSupportedLanguageTag,
} from "@/lib/translation/languageRegistry";
import { readSeriesTranslationLearningPreference } from "@/lib/translation/translationLearningPreference";
import {
  finalizePublicTranslationCreditUnlock,
  finalizePublicTranslationIncludedUnlock,
  isPublicTranslationCreditsEnabled,
} from "@/lib/translation/publicTranslationCredits.server";

export const runtime = "nodejs";

type UnlockMethod = "included" | "credit";

export async function POST(request: Request) {
  if (!isPublicTranslationCreditsEnabled()) {
    return NextResponse.json({ ok: false, error: "credit_runtime_disabled" }, { status: 404 });
  }

  let payload: {
    episodeId?: unknown;
    sourceLanguage?: unknown;
    targetLanguage?: unknown;
    method?: unknown;
  };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_request" }, { status: 400 });
  }

  const episodeId = typeof payload.episodeId === "string" ? payload.episodeId.trim() : "";
  const sourceLanguage = parseSupportedLanguageTag(payload.sourceLanguage);
  const targetLanguage = parseSupportedLanguageTag(payload.targetLanguage);
  const method: UnlockMethod | null =
    payload.method === "included" || payload.method === "credit" ? payload.method : null;

  if (
    !episodeId ||
    !sourceLanguage ||
    !targetLanguage ||
    sourceLanguage === targetLanguage ||
    !method ||
    !isPublicTranslationLanguagePair({ sourceLanguage, targetLanguage })
  ) {
    return NextResponse.json({ ok: false, error: "invalid_request" }, { status: 400 });
  }

  const access = await resolveEpisodeTranslationAccess(episodeId);
  if (!access || !access.canRead || !access.body.trim()) {
    return NextResponse.json({ ok: false, error: "episode_not_found" }, { status: 404 });
  }
  if (!access.currentUserId) {
    return NextResponse.json({ ok: false, error: "authentication_required" }, { status: 401 });
  }
  if (access.sourceLanguage !== sourceLanguage) {
    return NextResponse.json({ ok: false, error: "invalid_source_language" }, { status: 400 });
  }
  if (!access.isAllowlisted) {
    return NextResponse.json({ ok: false, error: "translation_episode_not_eligible" }, { status: 403 });
  }

  const parsedLearningPreference = readSeriesTranslationLearningPreference(
    access.series.effect_settings ?? access.series.effectSettings
  );
  const learningPreference =
    parsedLearningPreference?.language === targetLanguage ? parsedLearningPreference : null;
  const sourceHash = buildEpisodeTranslationSourceHash(
    access.body,
    learningPreference ? { learningPreference } : undefined
  );
  const admin = createAdminClient();
  const readyResult = await admin
    .from("episode_translations")
    .select("id")
    .eq("episode_id", access.episode.id)
    .eq("source_language", sourceLanguage)
    .eq("target_language", targetLanguage)
    .eq("source_hash", sourceHash)
    .eq("status", "ready")
    .maybeSingle();
  if (readyResult.error) {
    return NextResponse.json({ ok: false, error: "translation_storage_unavailable" }, { status: 503 });
  }
  if (!readyResult.data?.id) {
    return NextResponse.json({ ok: false, error: "translation_not_ready" }, { status: 409 });
  }

  try {
    if (method === "included") {
      const result = await finalizePublicTranslationIncludedUnlock({
        request,
        episodeId: access.episode.id,
        sourceLanguage,
        targetLanguage,
      });
      if (!result.allowed) {
        return NextResponse.json(
          {
            ok: false,
            error: result.resultType === "daily_limit" ? "included_allowance_exhausted" : result.resultType,
            usage: { used: result.used, limit: result.limit },
          },
          { status: result.resultType === "login_required" ? 401 : 409 }
        );
      }
      return NextResponse.json({
        ok: true,
        status: "unlocked",
        unlockSource: "included",
        consumedAllowance: result.consumedAllowance,
        usage: { used: result.used, limit: result.limit },
      });
    }

    const result = await finalizePublicTranslationCreditUnlock({
      episodeId: access.episode.id,
      sourceLanguage,
      targetLanguage,
    });
    if (!result.allowed) {
      return NextResponse.json(
        {
          ok: false,
          error: result.resultType === "insufficient_balance" ? "insufficient_credit_balance" : result.resultType,
          balance: result.balanceAfter,
        },
        { status: result.resultType === "login_required" ? 401 : 402 }
      );
    }
    return NextResponse.json({
      ok: true,
      status: "unlocked",
      unlockSource: "credit",
      charged: result.charged,
      balance: result.balanceAfter,
    });
  } catch (error) {
    console.error("[public-translation-unlock]", error);
    return NextResponse.json(
      { ok: false, error: "unlock_failed" },
      { status: 500 }
    );
  }
}
