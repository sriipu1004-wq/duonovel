import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildEpisodeTranslationSource,
  buildEpisodeTranslationSourceHash,
  resolveEpisodeTranslationAccess,
  TRANSLATION_SOURCE_LANGUAGE,
  TRANSLATION_TARGET_LANGUAGE,
  type EpisodeTranslationAccess,
} from "@/lib/translation/episodeTranslationServer";
import { DEFAULT_TRANSLATION_MODEL } from "@/lib/translation/openAITranslationModel";
import {
  isPublicTranslationLanguagePair,
  parseSupportedLanguageTag,
  type SupportedLanguageTag,
} from "@/lib/translation/languageRegistry";
import { readSeriesTranslationLearningPreference } from "@/lib/translation/translationLearningPreference";
import { resolveSeriesTranslationConsistency } from "@/lib/translation/seriesTranslationConsistencyServer";
import {
  EPISODE_TRANSLATION_LIMITS,
  estimateEpisodeTranslationGuardrailCostJpy,
  estimateEpisodeTranslationTokens,
  resolveEpisodeTranslationMaxSourceChars,
} from "@/lib/translation/episodeTranslationGenerateLimits";
import { readPublicDomainMetadata } from "@/lib/publicDomainMetadata";
import type { SeriesTranslationConsistencyContext } from "@/lib/translation/seriesTranslationConsistency";

type EpisodeTranslationSource = ReturnType<typeof buildEpisodeTranslationSource>;
type LearningPreference = ReturnType<typeof readSeriesTranslationLearningPreference>;

export type PreparedEpisodeTranslationGeneration = {
  access: EpisodeTranslationAccess;
  sourceLanguage: SupportedLanguageTag;
  targetLanguage: SupportedLanguageTag;
  source: EpisodeTranslationSource;
  sourceChars: number;
  sourceHash: string;
  model: string;
  learningPreference: LearningPreference;
  consistency: SeriesTranslationConsistencyContext;
  estimatedTokens: { inputTokens: number; outputTokens: number };
  estimatedCostJpy: number;
};

export type PrepareEpisodeTranslationGenerationResult =
  | { prepared: PreparedEpisodeTranslationGeneration; response?: never }
  | { response: Response; prepared?: never };

export async function prepareEpisodeTranslationGeneration(request: Request): Promise<PrepareEpisodeTranslationGenerationResult> {
  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return { response: NextResponse.json({ ok: false, error: "invalid_request" }, { status: 400 }) };
  }

  const episodeId = typeof payload.episodeId === "string" ? payload.episodeId.trim() : "";
  const sourceLanguage = payload.sourceLanguage === undefined ? TRANSLATION_SOURCE_LANGUAGE : parseSupportedLanguageTag(payload.sourceLanguage);
  const targetLanguage = payload.targetLanguage === undefined ? TRANSLATION_TARGET_LANGUAGE : parseSupportedLanguageTag(payload.targetLanguage);
  if (!episodeId || !sourceLanguage || !targetLanguage || sourceLanguage === targetLanguage || !isPublicTranslationLanguagePair({ sourceLanguage, targetLanguage })) {
    return { response: NextResponse.json({ ok: false, error: "invalid_request" }, { status: 400 }) };
  }
  if (!EPISODE_TRANSLATION_LIMITS.enabled) {
    return { response: NextResponse.json({ ok: false, error: "translation_temporarily_disabled", message: "現在、対訳の生成は一時停止しています。" }, { status: 503 }) };
  }

  const access = await resolveEpisodeTranslationAccess(episodeId);
  if (!access || !access.canRead || !access.body.trim()) return { response: NextResponse.json({ ok: false, error: "episode_not_found" }, { status: 404 }) };
  if (!access.sourceLanguage || access.sourceLanguage !== sourceLanguage) return { response: NextResponse.json({ ok: false, error: "invalid_source_language" }, { status: 400 }) };
  if (!access.isAllowlisted) return { response: NextResponse.json({ ok: false, error: "translation_episode_not_eligible", message: "この話では対訳を生成できません。" }, { status: 403 }) };

  const parsedLearningPreference = readSeriesTranslationLearningPreference(access.series.effect_settings ?? access.series.effectSettings);
  const learningPreference = parsedLearningPreference?.language === targetLanguage ? parsedLearningPreference : null;
  const source = buildEpisodeTranslationSource(access.body, sourceLanguage);
  const sourceChars = source.normalizedSource.length;
  const verifiedPublicDomain = Boolean(
    readPublicDomainMetadata(
      access.series.effect_settings ?? access.series.effectSettings
    )
  );
  const maxSourceChars = resolveEpisodeTranslationMaxSourceChars({
    verifiedPublicDomain,
  });
  if (sourceChars > maxSourceChars) {
    return { response: NextResponse.json({ ok: false, error: "translation_source_too_long", maxSourceChars }, { status: 413 }) };
  }
  if (source.segments.length === 0) return { response: NextResponse.json({ ok: false, error: "translation_source_empty" }, { status: 400 }) };

  const sourceHash = buildEpisodeTranslationSourceHash(access.body, learningPreference ? { learningPreference } : undefined);
  const model = process.env.EPISODE_TRANSLATION_MODEL ?? DEFAULT_TRANSLATION_MODEL;
  const admin = createAdminClient();
  const currentTranslationResult = await admin
    .from("episode_translations")
    .select("id, status")
    .eq("episode_id", access.episode.id)
    .eq("source_language", sourceLanguage)
    .eq("target_language", targetLanguage)
    .eq("source_hash", sourceHash)
    .maybeSingle();
  if (currentTranslationResult.error) return { response: NextResponse.json({ ok: false, error: "translation_storage_unavailable", message: currentTranslationResult.error.message }, { status: 503 }) };
  if (currentTranslationResult.data?.status === "ready") return { response: NextResponse.json({ ok: true, status: "ready" }) };
  if (currentTranslationResult.data?.status === "translating") return { response: NextResponse.json({ ok: true, status: "translating" }, { status: 202 }) };

  const consistency = await resolveSeriesTranslationConsistency({ access, sourceLanguage, targetLanguage, currentSource: source.normalizedSource });
  const estimatedTokens = estimateEpisodeTranslationTokens({ sourceChars, consistencyReferenceChars: consistency.referenceChars, model });
  const estimatedCostJpy = estimateEpisodeTranslationGuardrailCostJpy(estimatedTokens.inputTokens, estimatedTokens.outputTokens);
  return {
    prepared: {
      access,
      sourceLanguage,
      targetLanguage,
      source,
      sourceChars,
      sourceHash,
      model,
      learningPreference,
      consistency,
      estimatedTokens,
      estimatedCostJpy,
    },
  };
}
