import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  buildEpisodeTranslationSource,
  buildEpisodeTranslationSourceHash,
  resolveEpisodeTranslationAccess,
} from "@/lib/translation/episodeTranslationServer";
import {
  isPublicTranslationLanguagePair,
  parseSupportedLanguageTag,
} from "@/lib/translation/languageRegistry";
import {
  createTranslationPayload,
  parseStoredTranslationPayload,
  type TranslationSegment,
} from "@/lib/translation/translationPayload";
import { isUuid } from "@/lib/uuid";

export const runtime = "nodejs";

const MAX_TRANSLATED_SEGMENT_CHARS = 5_000;
const MAX_TRANSLATED_TOTAL_CHARS = 120_000;

type RouteContext = {
  params: Promise<{ episodeId: string }>;
};

function readTargetLanguage(request: Request) {
  return parseSupportedLanguageTag(new URL(request.url).searchParams.get("targetLanguage"));
}

async function resolveAuthorizedContext(
  request: Request,
  context: RouteContext
) {
  const { episodeId } = await context.params;
  if (!isUuid(episodeId)) {
    return { error: NextResponse.json({ ok: false, error: "episode_not_found" }, { status: 404 }) };
  }

  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  const user = authData.user ?? null;
  if (authError || !user) {
    return { error: NextResponse.json({ ok: false, error: "authentication_required" }, { status: 401 }) };
  }

  const access = await resolveEpisodeTranslationAccess(episodeId);
  if (!access || !access.canRead || !access.body.trim()) {
    return { error: NextResponse.json({ ok: false, error: "episode_not_found" }, { status: 404 }) };
  }
  if (!access.isAllowlisted) {
    return {
      error: NextResponse.json(
        { ok: false, error: "translation_episode_not_eligible" },
        { status: 403 }
      ),
    };
  }

  const targetLanguage = readTargetLanguage(request);
  const sourceLanguage = access.sourceLanguage;
  if (
    !sourceLanguage ||
    !targetLanguage ||
    sourceLanguage === targetLanguage ||
    !isPublicTranslationLanguagePair({ sourceLanguage, targetLanguage })
  ) {
    return { error: NextResponse.json({ ok: false, error: "invalid_language_pair" }, { status: 400 }) };
  }

  const sourceDocument = buildEpisodeTranslationSource(access.body, sourceLanguage);
  const sourceHash = buildEpisodeTranslationSourceHash(access.body);

  return {
    supabase,
    user,
    access,
    sourceLanguage,
    targetLanguage,
    sourceDocument,
    sourceHash,
  };
}

export async function GET(request: Request, context: RouteContext) {
  const resolved = await resolveAuthorizedContext(request, context);
  if ("error" in resolved) return resolved.error;

  const { supabase, user, access, sourceLanguage, targetLanguage, sourceDocument, sourceHash } = resolved;
  const result = await supabase
    .from("user_episode_translations")
    .select("segments, updated_at")
    .eq("user_id", user.id)
    .eq("episode_id", access.episode.id)
    .eq("source_language", sourceLanguage)
    .eq("target_language", targetLanguage)
    .eq("source_hash", sourceHash)
    .maybeSingle();

  if (result.error) {
    console.error("[human-translation-read]", result.error);
    return NextResponse.json(
      { ok: false, error: "human_translation_storage_unavailable" },
      { status: 503 }
    );
  }

  const stored = result.data
    ? parseStoredTranslationPayload(result.data.segments, {
        sourceLanguage,
        targetLanguage,
      })
    : null;

  return NextResponse.json({
    ok: true,
    sourceLanguage,
    targetLanguage,
    sourceHash,
    sourceSegments: sourceDocument.segments.map((segment) => ({
      id: segment.id,
      sourceText: segment.sourceText,
    })),
    translatedSegments: stored?.segments.map((segment) => ({
      id: segment.id,
      translatedText: segment.translatedText,
    })) ?? [],
    updatedAt: result.data?.updated_at ?? null,
  });
}

export async function PUT(request: Request, context: RouteContext) {
  const resolved = await resolveAuthorizedContext(request, context);
  if ("error" in resolved) return resolved.error;

  let payload: { segments?: unknown };
  try {
    payload = (await request.json()) as { segments?: unknown };
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_request" }, { status: 400 });
  }

  const rawSegments = Array.isArray(payload.segments) ? payload.segments : null;
  if (!rawSegments) {
    return NextResponse.json({ ok: false, error: "invalid_segments" }, { status: 400 });
  }

  const { supabase, user, access, sourceLanguage, targetLanguage, sourceDocument, sourceHash } = resolved;
  if (rawSegments.length !== sourceDocument.segments.length) {
    return NextResponse.json({ ok: false, error: "segment_count_mismatch" }, { status: 409 });
  }

  let totalChars = 0;
  const translatedSegments: TranslationSegment[] = [];

  for (let index = 0; index < sourceDocument.segments.length; index += 1) {
    const source = sourceDocument.segments[index]!;
    const raw = rawSegments[index];
    if (!raw || typeof raw !== "object") {
      return NextResponse.json({ ok: false, error: "invalid_segments" }, { status: 400 });
    }

    const row = raw as Record<string, unknown>;
    const id = typeof row.id === "string" ? row.id : "";
    const translatedText =
      typeof row.translatedText === "string" ? row.translatedText.trim() : "";

    if (
      id !== source.id ||
      !translatedText ||
      translatedText.length > MAX_TRANSLATED_SEGMENT_CHARS
    ) {
      return NextResponse.json({ ok: false, error: "invalid_segments" }, { status: 400 });
    }

    totalChars += translatedText.length;
    if (totalChars > MAX_TRANSLATED_TOTAL_CHARS) {
      return NextResponse.json({ ok: false, error: "translation_too_large" }, { status: 413 });
    }

    translatedSegments.push({
      id: source.id,
      sourceText: source.sourceText,
      translatedText,
      paragraphIndex: source.paragraphIndex,
      sentenceIndex: source.sentenceIndex,
      startOffset: source.startOffset,
      endOffset: source.endOffset,
    });
  }

  const now = new Date().toISOString();
  const translation = createTranslationPayload({
    sourceLanguage,
    targetLanguage,
    segments: translatedSegments,
  });

  const result = await supabase
    .from("user_episode_translations")
    .upsert(
      {
        user_id: user.id,
        episode_id: access.episode.id,
        source_language: sourceLanguage,
        target_language: targetLanguage,
        source_hash: sourceHash,
        segment_version: translation.version,
        segments: translation,
        updated_at: now,
      },
      {
        onConflict:
          "user_id,episode_id,source_language,target_language,source_hash",
      }
    )
    .select("id, updated_at")
    .single();

  if (result.error || !result.data) {
    console.error("[human-translation-save]", result.error);
    return NextResponse.json(
      { ok: false, error: "human_translation_save_failed" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    id: result.data.id,
    updatedAt: result.data.updated_at,
  });
}
