"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import BilingualLanguagePickerDialog, {
  type BilingualTranslationAvailability,
} from "@/features/playback/BilingualLanguagePickerDialog";
import { useAiUsage } from "@/features/usage/useAiUsage";
import {
  isPublicTranslationTargetLanguage,
  type PublicTranslationTargetLanguage,
  type SupportedLanguageTag,
} from "@/lib/translation/languageRegistry";
import { detectSourceLanguageFromText } from "@/lib/translation/detectSourceLanguage";
import {
  readBilingualSessionPreference,
  writeBilingualSessionPreference,
} from "@/lib/translation/bilingualSessionPreference";

type GeneratedStoryPayload = {
  id: string;
  createdAt: string;
  request: {
    scene?: string;
    timeMinutes?: number;
    genre?: string;
    mood?: string;
  };
  story: {
    title: string;
    synopsis?: string;
    body: string;
    estimatedReadingMinutes?: number;
    tags?: string[];
  };
};

type SavedGeneratedStoryPayload = GeneratedStoryPayload & {
  savedSeriesId?: string;
  savedEpisodeId?: string;
  readHref?: string;
};

const SAVED_STORIES_KEY = "libread.savedGeneratedStories.v1";

function readSavedStory(storyId: string): SavedGeneratedStoryPayload | null {
  const savedRaw = window.localStorage.getItem(SAVED_STORIES_KEY);
  if (!savedRaw) return null;

  try {
    const parsed = JSON.parse(savedRaw) as SavedGeneratedStoryPayload[];
    if (!Array.isArray(parsed)) return null;
    return parsed.find((item) => item?.id === storyId) ?? null;
  } catch {
    return null;
  }
}

function readGeneratedStory(storyId: string): SavedGeneratedStoryPayload | null {
  const savedStory = readSavedStory(storyId);
  const sessionRaw = window.sessionStorage.getItem(
    `libread.generatedStory.${storyId}`
  );

  if (sessionRaw) {
    try {
      const parsed = JSON.parse(sessionRaw) as GeneratedStoryPayload;
      if (parsed?.id && parsed?.story?.title && parsed?.story?.body) {
        return {
          ...parsed,
          savedSeriesId: savedStory?.savedSeriesId,
          savedEpisodeId: savedStory?.savedEpisodeId,
          readHref: savedStory?.readHref,
        };
      }
    } catch {
      // Fall through to saved-story storage.
    }
  }

  return savedStory;
}

function buildBilingualHref(
  readHref: string,
  sourceLanguage: SupportedLanguageTag,
  targetLanguage: PublicTranslationTargetLanguage,
  autoGenerate: boolean,
  lockLanguage: boolean
): string {
  return `${readHref}${readHref.includes("?") ? "&" : "?"}bilingual=1&sourceLanguage=${encodeURIComponent(sourceLanguage)}&targetLanguage=${encodeURIComponent(targetLanguage)}${autoGenerate ? "&autoGenerate=1" : ""}${lockLanguage ? "&lockLanguage=1" : ""}`;
}

function findSynopsisActionAnchor(
  generated: SavedGeneratedStoryPayload | null
): { parent: HTMLElement; before: Element | null } | null {
  const synopsis = generated?.story.synopsis?.trim() ?? "";

  if (synopsis) {
    const paragraphs = Array.from(document.querySelectorAll<HTMLElement>("main p"));
    const synopsisNode = paragraphs.find(
      (node) => node.textContent?.trim() === synopsis
    );
    const card = synopsisNode?.parentElement;
    const parent = card?.parentElement;

    if (card instanceof HTMLElement && parent instanceof HTMLElement) {
      return { parent, before: card.nextElementSibling };
    }
  }

  const article = document.querySelector<HTMLElement>("main article");
  const parent = article?.parentElement;
  return parent instanceof HTMLElement
    ? { parent, before: article ?? null }
    : null;
}

export default function GeneratedStoryBilingualBridge({
  storyId,
}: {
  storyId: string;
}) {
  const { snapshot: aiUsage } = useAiUsage();
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [message, setMessage] = useState("");
  const [isLanguagePickerOpen, setIsLanguagePickerOpen] = useState(false);
  const [translationAvailability, setTranslationAvailability] =
    useState<BilingualTranslationAvailability>("checking");
  const [rememberForTab, setRememberForTab] = useState(false);
  const [targetLanguage, setTargetLanguage] =
    useState<PublicTranslationTargetLanguage>("en");
  const [sourceLanguage, setSourceLanguage] =
    useState<SupportedLanguageTag>("ja");
  const availabilityCheckVersionRef = useRef(0);

  useEffect(() => {
    let currentHost: HTMLElement | null = null;

    function ensureHost() {
      const generated = readGeneratedStory(storyId);
      const anchor = findSynopsisActionAnchor(generated);

      if (!anchor) {
        if (currentHost && !currentHost.isConnected) {
          currentHost = null;
          setHost(null);
        }
        return;
      }

      const existing = anchor.parent.querySelector<HTMLElement>(
        ":scope > [data-generated-bilingual-action-host='true']"
      );

      if (existing) {
        if (currentHost !== existing) {
          currentHost = existing;
          setHost(existing);
        }
        return;
      }

      const nextHost = document.createElement("div");
      nextHost.dataset.generatedBilingualActionHost = "true";
      anchor.parent.insertBefore(nextHost, anchor.before);

      currentHost = nextHost;
      setHost(nextHost);
    }

    ensureHost();

    const observer = new MutationObserver(ensureHost);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      if (currentHost?.isConnected) currentHost.remove();
      currentHost = null;
    };
  }, [storyId]);

  async function checkTranslationAvailability(
    generated: SavedGeneratedStoryPayload,
    detectedSourceLanguage: SupportedLanguageTag,
    language: PublicTranslationTargetLanguage,
    existingVersion?: number
  ) {
    const checkVersion = existingVersion ?? ++availabilityCheckVersionRef.current;
    if (existingVersion === undefined) setTranslationAvailability("checking");

    try {
      const response = generated.savedEpisodeId
        ? await fetch(
            `/api/episode-translations/${encodeURIComponent(generated.savedEpisodeId)}?sourceLanguage=${encodeURIComponent(detectedSourceLanguage)}&targetLanguage=${encodeURIComponent(language)}`,
            { cache: "no-store" }
          )
        : await fetch("/api/generated-story-translations/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              storyId: generated.id,
              title: generated.story.title,
              body: generated.story.body,
              sourceLanguage: detectedSourceLanguage,
              targetLanguage: language,
              checkOnly: true,
            }),
          });
      const payload = (await response.json()) as {
        ok?: boolean;
        status?: BilingualTranslationAvailability;
      };
      if (availabilityCheckVersionRef.current !== checkVersion) return;

      if (!response.ok || !payload.ok || !payload.status) {
        setTranslationAvailability("error");
        return;
      }

      setTranslationAvailability(payload.status);
      if (payload.status === "translating") {
        window.setTimeout(
          () =>
            void checkTranslationAvailability(
              generated,
              detectedSourceLanguage,
              language,
              checkVersion
            ),
          2500
        );
      }
    } catch {
      if (availabilityCheckVersionRef.current !== checkVersion) return;
      setTranslationAvailability("error");
    }
  }

  function enableBilingual() {
    setMessage("");
    const generated = readGeneratedStory(storyId);

    if (!generated) {
      setMessage("生成した物語の一時データを読み込めませんでした。");
      return;
    }

    const detectedSourceLanguage = detectSourceLanguageFromText(
      generated.story.body
    );
    setSourceLanguage(detectedSourceLanguage);
    const scope = generated.savedSeriesId ? "series" : "generated";
    const contentId = generated.savedSeriesId || storyId;
    const sessionPreference = readBilingualSessionPreference(
      scope,
      contentId,
      detectedSourceLanguage
    );
    if (
      sessionPreference &&
      isPublicTranslationTargetLanguage(sessionPreference.targetLanguage)
    ) {
      setTargetLanguage(sessionPreference.targetLanguage);
      openBilingual(
        generated,
        detectedSourceLanguage,
        sessionPreference.targetLanguage,
        true,
        true
      );
      return;
    }

    const selectedLanguage =
      targetLanguage === detectedSourceLanguage
        ? detectedSourceLanguage === "ja"
          ? "en"
          : "ja"
        : targetLanguage;
    setTargetLanguage(selectedLanguage);
    setRememberForTab(false);
    setIsLanguagePickerOpen(true);
    void checkTranslationAvailability(
      generated,
      detectedSourceLanguage,
      selectedLanguage
    );
  }

  function openBilingual(
    generated: SavedGeneratedStoryPayload,
    selectedSourceLanguage: SupportedLanguageTag,
    selectedTargetLanguage: PublicTranslationTargetLanguage,
    autoGenerate: boolean,
    lockLanguage: boolean
  ) {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }

    if (generated.readHref) {
      window.location.assign(
        buildBilingualHref(
          generated.readHref,
          selectedSourceLanguage,
          selectedTargetLanguage,
          autoGenerate,
          lockLanguage
        )
      );
      return;
    }

    window.location.assign(
      `/read/generated/${encodeURIComponent(storyId)}?bilingual=1&sourceLanguage=${encodeURIComponent(selectedSourceLanguage)}&targetLanguage=${encodeURIComponent(selectedTargetLanguage)}${autoGenerate ? "&autoGenerate=1" : ""}${lockLanguage ? "&lockLanguage=1" : ""}`
    );
  }

  function confirmBilingual() {
    const generated = readGeneratedStory(storyId);
    if (!generated) return;
    if (rememberForTab) {
      const scope = generated.savedSeriesId ? "series" : "generated";
      const contentId = generated.savedSeriesId || storyId;
      writeBilingualSessionPreference(scope, contentId, targetLanguage);
    }
    openBilingual(
      generated,
      sourceLanguage,
      targetLanguage,
      translationAvailability !== "ready",
      rememberForTab
    );
  }

  if (!host) return null;

  return createPortal(
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <span className="rounded-full border border-black/10 bg-neutral-50 px-4 py-2 text-sm text-neutral-600">
        ブラウザ読み上げ
      </span>
      <button
        type="button"
        onClick={enableBilingual}
        className="rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-medium text-black transition hover:bg-sky-100"
      >
        対訳をオン
      </button>
      {message ? (
        <span className="w-full text-sm text-red-700">{message}</span>
      ) : null}
      {isLanguagePickerOpen ? (
        <BilingualLanguagePickerDialog
          sourceLanguage={sourceLanguage}
          targetLanguage={targetLanguage}
          availability={translationAvailability}
          rememberForTab={rememberForTab}
          translationUsage={aiUsage?.actions.translation_generation}
          onTargetLanguageChange={(language) => {
            setTargetLanguage(language);
            const generated = readGeneratedStory(storyId);
            if (generated) {
              void checkTranslationAvailability(
                generated,
                sourceLanguage,
                language
              );
            }
          }}
          onRememberForTabChange={setRememberForTab}
          onCancel={() => setIsLanguagePickerOpen(false)}
          onConfirm={confirmBilingual}
          onRetry={() => {
            const generated = readGeneratedStory(storyId);
            if (generated) {
              void checkTranslationAvailability(
                generated,
                sourceLanguage,
                targetLanguage
              );
            }
          }}
        />
      ) : null}
    </div>,
    host
  );
}
