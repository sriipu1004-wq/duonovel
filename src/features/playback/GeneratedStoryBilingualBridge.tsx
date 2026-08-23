"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

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

function buildBilingualHref(readHref: string): string {
  return `${readHref}${readHref.includes("?") ? "&" : "?"}bilingual=1`;
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
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [message, setMessage] = useState("");

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

  function enableBilingual() {
    setMessage("");
    const generated = readGeneratedStory(storyId);

    if (!generated) {
      setMessage("生成した物語の一時データを読み込めませんでした。");
      return;
    }

    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }

    if (generated.readHref) {
      window.location.assign(buildBilingualHref(generated.readHref));
      return;
    }

    window.location.assign(
      `/read/generated/${encodeURIComponent(storyId)}?bilingual=1`
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
    </div>,
    host
  );
}
