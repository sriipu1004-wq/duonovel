import { NextResponse } from "next/server";
import { prepareEpisodeTranslationGeneration } from "@/lib/translation/prepareEpisodeTranslationGeneration";
import { translatePublicEpisodeWithConsistency } from "@/lib/translation/publicEpisodeTranslation";
import { pickText } from "@/features/write/writeShared";

export const dynamic = "force-dynamic";

const cases = [
  {
    label: "alice-en-ja",
    episodeId: "b9175c0e-d66d-4d2a-8802-9c62bec4dd98",
    sourceLanguage: "en",
    targetLanguage: "ja",
  },
  {
    label: "akutagawa-ja-ko",
    episodeId: "a543e3af-faa2-4f0d-b131-4f7f70852be0",
    sourceLanguage: "ja",
    targetLanguage: "ko",
  },
  {
    label: "kim-korean-en",
    episodeId: "0e827845-b356-4c2a-b21b-93982f92a14b",
    sourceLanguage: "ko",
    targetLanguage: "en",
  },
] as const;

export async function GET() {
  if (
    process.env.VERCEL_ENV !== "preview" ||
    process.env.VERCEL_GIT_COMMIT_REF !==
      "fix/public-domain-translation-permission-failures"
  ) {
    return new Response(null, { status: 404 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: "missing_openai_api_key" }, { status: 500 });
  }

  const closedRequest = new Request(
    "https://preview.invalid/api/episode-translations/generate",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        episodeId: "c42a1401-ca82-44dd-bcd2-bc92429b064a",
        sourceLanguage: "ja",
        targetLanguage: "en",
      }),
    }
  );
  const closedPrepared = await prepareEpisodeTranslationGeneration(closedRequest);
  const closedPermissionCheck = closedPrepared.response
    ? {
        status: closedPrepared.response.status,
        body: await closedPrepared.response.clone().json().catch(() => null),
      }
    : { status: 200, body: { error: "unexpectedly_prepared" } };

  const results = [];
  for (const item of cases) {
    const request = new Request("https://preview.invalid/api/episode-translations/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        episodeId: item.episodeId,
        sourceLanguage: item.sourceLanguage,
        targetLanguage: item.targetLanguage,
      }),
    });
    const preparedResult = await prepareEpisodeTranslationGeneration(request);
    if (preparedResult.response) {
      results.push({
        label: item.label,
        ok: false,
        stage: "prepare",
        status: preparedResult.response.status,
        body: await preparedResult.response.clone().json().catch(() => null),
      });
      continue;
    }

    const prepared = preparedResult.prepared;
    try {
      const translated = await translatePublicEpisodeWithConsistency({
        apiKey,
        model: prepared.model,
        workTitle: pickText(prepared.access.series.title) || "Untitled",
        episodeTitle:
          pickText(prepared.access.episode.title, prepared.access.episode["episode_title"]) ||
          `Episode ${prepared.access.episodeNumber}`,
        sourceLanguage: prepared.sourceLanguage,
        targetLanguage: prepared.targetLanguage,
        segments: prepared.source.segments.map((segment) => ({
          id: segment.id,
          text: segment.translationInput,
        })),
        consistency: prepared.consistency,
        learningPreference: prepared.learningPreference,
      });
      results.push({
        label: item.label,
        ok: true,
        sourceChars: prepared.sourceChars,
        segmentCount: prepared.source.segments.length,
        translatedSegments: translated.segments.length,
        batchCount: translated.batchCount,
        retryCount: translated.retryCount,
        inputTokens: translated.inputTokens,
        outputTokens: translated.outputTokens,
      });
    } catch (error) {
      results.push({
        label: item.label,
        ok: false,
        stage: "translate",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return NextResponse.json({
    ok:
      results.every((result) => result.ok) &&
      closedPermissionCheck.status === 403,
    closedPermissionCheck,
    results,
  });
}
