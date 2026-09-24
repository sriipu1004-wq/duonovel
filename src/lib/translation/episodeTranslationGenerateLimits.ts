import { getDefaultTextTokenPricesUsd } from "@/lib/translation/openAITranslationModel";

function readBooleanEnv(name: string, fallback: boolean): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  if (!value) return fallback;
  if (value === "true" || value === "1" || value === "yes") return true;
  if (value === "false" || value === "0" || value === "no") return false;
  return fallback;
}

function readNonNegativeNumberEnv(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function readPositiveIntEnv(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

export const EPISODE_TRANSLATION_LIMITS = {
  enabled: readBooleanEnv("EPISODE_TRANSLATION_ENABLED", true),
  dailyMaxRequests: readPositiveIntEnv("EPISODE_TRANSLATION_DAILY_MAX_REQUESTS", 200),
  dailyMaxEstimatedCostJpy: readNonNegativeNumberEnv(
    "EPISODE_TRANSLATION_DAILY_MAX_ESTIMATED_COST_JPY",
    100
  ),
  maxSourceChars: readPositiveIntEnv("EPISODE_TRANSLATION_MAX_SOURCE_CHARS", 8000),
  publicDomainMaxSourceChars: readPositiveIntEnv(
    "PUBLIC_DOMAIN_TRANSLATION_MAX_SOURCE_CHARS",
    40000
  ),
  estimatedInputJpyPer1kTokens: readNonNegativeNumberEnv(
    "EPISODE_TRANSLATION_ESTIMATED_INPUT_JPY_PER_1K_TOKENS",
    0.2
  ),
  estimatedOutputJpyPer1kTokens: readNonNegativeNumberEnv(
    "EPISODE_TRANSLATION_ESTIMATED_OUTPUT_JPY_PER_1K_TOKENS",
    1
  ),
  actualUsdJpyRate: readNonNegativeNumberEnv(
    "EPISODE_TRANSLATION_ACTUAL_USD_JPY_RATE",
    160
  ),
} as const;

export function estimateEpisodeTranslationTokens(args: {
  sourceChars: number;
  consistencyReferenceChars: number;
  model: string;
}) {
  const longContextModel = /^gpt-5\.(?:4|5|6)(?:-|$)/.test(args.model);
  const estimatedBatchCount = longContextModel
    ? 1
    : Math.max(1, Math.ceil(args.sourceChars / 900));
  const referenceTokens = Math.ceil(args.consistencyReferenceChars * 1.2);
  return {
    inputTokens: Math.max(
      1,
      Math.ceil(args.sourceChars * 1.2) + 800 + referenceTokens * estimatedBatchCount
    ),
    outputTokens: Math.max(1, Math.ceil(args.sourceChars * 0.9) + 400),
  };
}

export function estimateEpisodeTranslationGuardrailCostJpy(
  inputTokens: number,
  outputTokens: number
): number {
  const value =
    (inputTokens / 1000) * EPISODE_TRANSLATION_LIMITS.estimatedInputJpyPer1kTokens +
    (outputTokens / 1000) * EPISODE_TRANSLATION_LIMITS.estimatedOutputJpyPer1kTokens;
  return Math.ceil(value * 1000) / 1000;
}

export function estimateEpisodeTranslationActualCostJpy(
  inputTokens: number,
  outputTokens: number,
  model: string
): number {
  const prices = getDefaultTextTokenPricesUsd(model);
  const inputUsdPer1mTokens = readNonNegativeNumberEnv(
    "EPISODE_TRANSLATION_ACTUAL_INPUT_USD_PER_1M_TOKENS",
    prices.inputPer1mTokens
  );
  const outputUsdPer1mTokens = readNonNegativeNumberEnv(
    "EPISODE_TRANSLATION_ACTUAL_OUTPUT_USD_PER_1M_TOKENS",
    prices.outputPer1mTokens
  );
  const valueUsd =
    (inputTokens / 1_000_000) * inputUsdPer1mTokens +
    (outputTokens / 1_000_000) * outputUsdPer1mTokens;
  return (
    Math.ceil(valueUsd * EPISODE_TRANSLATION_LIMITS.actualUsdJpyRate * 1000) / 1000
  );
}


export function resolveEpisodeTranslationMaxSourceChars(args: {
  verifiedPublicDomain: boolean;
}): number {
  return args.verifiedPublicDomain
    ? Math.max(
        EPISODE_TRANSLATION_LIMITS.maxSourceChars,
        EPISODE_TRANSLATION_LIMITS.publicDomainMaxSourceChars
      )
    : EPISODE_TRANSLATION_LIMITS.maxSourceChars;
}
