"use client";

import { useEffect, useState, type ReactNode } from "react";
import ReaderModeSelector from "@/features/playback/ReaderModeSelector";
import TranslationLanguageSelect from "@/features/playback/TranslationLanguageSelect";
import GeneratedStoryBilingualPlayback from "@/features/playback/GeneratedStoryBilingualPlayback";
import { detectSourceLanguageFromText } from "@/lib/translation/detectSourceLanguage";
import {
  isPublicTranslationTargetLanguage,
  parseSupportedLanguageTag,
  type PublicTranslationTargetLanguage,
  type SupportedLanguageTag,
} from "@/lib/translation/languageRegistry";
import {
  applyReadingModeToHref,
  readReadingHistory,
  type ReadingMode,
} from "@/lib/playback/readingBookmark";

type GeneratedStoryPayload = {
  id: string;
  request?: {
    learningLanguage?: SupportedLanguageTag;
  };
  story?: {
    title?: string;
    body?: string;
    sourceLanguage?: SupportedLanguageTag;
  };
};

const SAVED_STORIES_KEY = "libread.savedGeneratedStories.v1";

function readGeneratedStory(storyId: string): GeneratedStoryPayload | null {
  try {
    const sessionRaw = window.sessionStorage.getItem(
      `libread.generatedStory.${storyId}`
    );
    if (sessionRaw) {
      const parsed = JSON.parse(sessionRaw) as GeneratedStoryPayload;
      if (parsed?.id === storyId && parsed.story?.body) return parsed;
    }

    const savedRaw = window.localStorage.getItem(SAVED_STORIES_KEY);
    if (!savedRaw) return null;
    const saved = JSON.parse(savedRaw) as GeneratedStoryPayload[];
    return Array.isArray(saved)
      ? saved.find((item) => item?.id === storyId) ?? null
      : null;
  } catch {
    return null;
  }
}

function defaultTarget(
  sourceLanguage: SupportedLanguageTag,
  preferred?: SupportedLanguageTag
): PublicTranslationTargetLanguage {
  if (
    preferred &&
    preferred !== sourceLanguage &&
    isPublicTranslationTargetLanguage(preferred)
  ) {
    return preferred;
  }
  return sourceLanguage === "ja" ? "en" : "ja";
}

export default function GeneratedStoryReaderShell({
  storyId,
  children,
}: {
  storyId: string;
  children: ReactNode;
}) {
  const [mode, setMode] = useState<ReadingMode>("standard");
  const [sourceLanguage, setSourceLanguage] =
    useState<SupportedLanguageTag>("ja");
  const [targetLanguage, setTargetLanguage] =
    useState<PublicTranslationTargetLanguage>("en");
  const [ready, setReady] = useState(false);

  function replaceUrl(
    nextMode: ReadingMode,
    nextTarget = targetLanguage
  ) {
    const seriesId = `generated:${storyId}`;
    const history = readReadingHistory(seriesId);
    const baseHref = history
      ? applyReadingModeToHref(window.location.href, {
          ...history,
          mode: nextMode,
          sourceLanguage,
          targetLanguage: nextTarget,
        })
      : window.location.href;
    const url = new URL(baseHref, window.location.origin);
    url.searchParams.set("readingMode", nextMode);

    if (nextMode === "bilingual" || nextMode === "translation") {
      url.searchParams.set("sourceLanguage", sourceLanguage);
      url.searchParams.set("targetLanguage", nextTarget);
      url.searchParams.set("autoGenerate", "1");
      if (nextMode === "bilingual") {
        url.searchParams.set("bilingual", "1");
        url.searchParams.delete("translationOnly");
      } else {
        url.searchParams.set("translationOnly", "1");
        url.searchParams.delete("bilingual");
      }
    } else {
      for (const key of [
        "bilingual",
        "translationOnly",
        "sourceLanguage",
        "targetLanguage",
        "autoGenerate",
        "lockLanguage",
      ]) {
        url.searchParams.delete(key);
      }
    }

    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${url.search}${url.hash}`
    );
  }

  function handleModeChange(nextMode: ReadingMode) {
    if (nextMode === mode) return;
    replaceUrl(nextMode);
    setMode(nextMode);
  }

  useEffect(() => {
    const generated = readGeneratedStory(storyId);
    const body = generated?.story?.body ?? "";
    const detected =
      parseSupportedLanguageTag(generated?.story?.sourceLanguage) ??
      (body.trim() ? detectSourceLanguageFromText(body) : "ja");
    const preferred = parseSupportedLanguageTag(
      generated?.request?.learningLanguage
    );

    const params = new URLSearchParams(window.location.search);
    const remembered = readReadingHistory(`generated:${storyId}`);
    const requestedMode: ReadingMode =
      params.get("translationOnly") === "1" ||
      params.get("readingMode") === "translation"
        ? "translation"
        : params.get("bilingual") === "1" ||
            params.get("readingMode") === "bilingual"
          ? "bilingual"
          : remembered?.mode ?? "standard";

    const requestedTarget = parseSupportedLanguageTag(
      params.get("targetLanguage")
    );
    const nextTarget =
      requestedTarget &&
      requestedTarget !== detected &&
      isPublicTranslationTargetLanguage(requestedTarget)
        ? requestedTarget
        : defaultTarget(
            detected,
            remembered?.targetLanguage
              ? parseSupportedLanguageTag(remembered.targetLanguage) ?? preferred ?? undefined
              : preferred ?? undefined
          );

    setSourceLanguage(detected);
    setTargetLanguage(nextTarget);
    setMode(requestedMode);
    setReady(true);
  }, [storyId]);

  if (!ready) return <>{children}</>;

  return (
    <>
      <ReaderModeSelector
        mode={mode}
        translationEnabled
        onChange={handleModeChange}
      />
      <div className="mx-auto flex w-full max-w-4xl justify-end px-3 pt-2 sm:px-6">
        <TranslationLanguageSelect
          value={targetLanguage}
          sourceLanguage={sourceLanguage}
          onChange={(language) => {
            setTargetLanguage(language);
            if (mode === "bilingual" || mode === "translation") {
              replaceUrl(mode, language);
            }
          }}
        />
      </div>
      {mode === "standard" ? (
        children
      ) : (
        <GeneratedStoryBilingualPlayback
          mode={mode}
          storyId={storyId}
          sourceLanguage={sourceLanguage}
          initialTargetLanguage={targetLanguage}
          autoGenerateMissingTranslation
          targetLanguageLocked={false}
        />
      )}
    </>
  );
}
