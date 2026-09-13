import { NextResponse } from "next/server";
import { executeEpisodeTranslationGeneration } from "@/lib/translation/executeEpisodeTranslationGeneration";
import { prepareEpisodeTranslationGeneration } from "@/lib/translation/prepareEpisodeTranslationGeneration";
import {
  finalizePublicTranslationCreditUnlock,
  finalizePublicTranslationIncludedUnlock,
  getPublicTranslationEntitlementState,
  isPublicTranslationCreditsEnabled,
} from "@/lib/translation/publicTranslationCredits.server";

export const runtime = "nodejs";
export const maxDuration = 300;

type UnlockMethod = "included" | "credit" | null;

export async function POST(request: Request) {
  let requestedUnlockMethod: UnlockMethod = null;
  try {
    const intentPayload = (await request.clone().json()) as { unlockMethod?: unknown };
    if (intentPayload.unlockMethod === "included" || intentPayload.unlockMethod === "credit") {
      requestedUnlockMethod = intentPayload.unlockMethod;
    }
  } catch {
    // prepareEpisodeTranslationGeneration owns request validation.
  }

  const prepared = await prepareEpisodeTranslationGeneration(request);
  if ("response" in prepared) return prepared.response;

  if (!isPublicTranslationCreditsEnabled()) {
    return executeEpisodeTranslationGeneration(request, prepared.prepared);
  }

  const generation = prepared.prepared;
  const entitlement = await getPublicTranslationEntitlementState({
    request,
    episodeId: generation.access.episode.id,
    targetLanguage: generation.targetLanguage,
  });

  if (!entitlement || entitlement.status === "login_required") {
    return NextResponse.json(
      {
        ok: false,
        error: "authentication_required",
        message: "翻訳の解放にはログインが必要です。",
      },
      { status: 401 }
    );
  }

  if (entitlement.status === "purchase_required") {
    return NextResponse.json(
      {
        ok: false,
        error: "included_allowance_exhausted",
        message: "本日の利用回数を使い切り、利用可能なクレジットがありません。",
        entitlement,
      },
      { status: 402 }
    );
  }

  if (
    entitlement.status === "included_available" &&
    requestedUnlockMethod !== "included"
  ) {
    return NextResponse.json(
      {
        ok: false,
        error: "included_unlock_required",
        entitlement,
      },
      { status: 409 }
    );
  }

  if (
    entitlement.status === "credit_required" &&
    requestedUnlockMethod !== "credit"
  ) {
    return NextResponse.json(
      {
        ok: false,
        error: "credit_confirmation_required",
        entitlement,
      },
      { status: 409 }
    );
  }

  const response = await executeEpisodeTranslationGeneration(
    request,
    generation,
    { entitlementRuntime: true }
  );
  let result: { ok?: boolean; status?: string } | null = null;
  try {
    result = (await response.clone().json()) as { ok?: boolean; status?: string };
  } catch {
    return response;
  }

  if (!response.ok || result?.ok !== true || result.status !== "ready") {
    return response;
  }

  // Source edits retain the entitlement identity, so an already-unlocked user
  // only regenerates the shared asset and is never charged again.
  if (entitlement.status === "unlocked") return response;

  if (entitlement.status === "included_available") {
    const unlock = await finalizePublicTranslationIncludedUnlock({
      request,
      episodeId: generation.access.episode.id,
      sourceLanguage: generation.sourceLanguage,
      targetLanguage: generation.targetLanguage,
    });
    if (!unlock.allowed) {
      return NextResponse.json(
        {
          ok: false,
          error:
            unlock.resultType === "daily_limit"
              ? "included_allowance_exhausted_after_generation"
              : unlock.resultType,
          message:
            "翻訳は準備できましたが、解放時点で本日の利用枠を使い切っていました。",
          assetReady: true,
        },
        { status: 409 }
      );
    }
    return NextResponse.json({
      ...result,
      unlocked: true,
      unlockSource: "included",
      consumedAllowance: unlock.consumedAllowance,
    });
  }

  const unlock = await finalizePublicTranslationCreditUnlock({
    episodeId: generation.access.episode.id,
    sourceLanguage: generation.sourceLanguage,
    targetLanguage: generation.targetLanguage,
  });
  if (!unlock.allowed) {
    return NextResponse.json(
      {
        ok: false,
        error:
          unlock.resultType === "insufficient_balance"
            ? "insufficient_credit_after_generation"
            : unlock.resultType,
        message:
          "翻訳は準備できましたが、解放に必要なクレジットが不足しています。",
        assetReady: true,
        balance: unlock.balanceAfter,
      },
      { status: 402 }
    );
  }

  return NextResponse.json({
    ...result,
    unlocked: true,
    unlockSource: "credit",
    charged: unlock.charged,
    balance: unlock.balanceAfter,
  });
}
