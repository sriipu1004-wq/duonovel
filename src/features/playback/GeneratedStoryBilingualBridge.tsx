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

type SavePrivateResult = {
  ok: boolean;
  seriesId?: string;
  episodeId?: string;
  readHref?: string;
  error?: string;
};

const SAVED_STORIES_KEY = "libread.savedGeneratedStories.v1";

function findDisplaySettingsSection(): HTMLElement | null {
  const sections = Array.from(document.querySelectorAll<HTMLElement>("main section"));

  for (const section of sections) {
    const hasDirectDisplayLabel = Array.from(section.children).some(
      (child) =>
        child instanceof HTMLParagraphElement &&
        child.textContent?.trim() === "DISPLAY"
    );

    if (hasDirectDisplayLabel) {
      return section;
    }
  }

  return null;
}

function readGeneratedStory(storyId: string): SavedGeneratedStoryPayload | null {
  const sessionRaw = window.sessionStorage.getItem(
    `libread.generatedStory.${storyId}`
  );

  if (sessionRaw) {
    try {
      const parsed = JSON.parse(sessionRaw) as GeneratedStoryPayload;
      if (parsed?.id && parsed?.story?.title && parsed?.story?.body) {
        return parsed;
      }
    } catch {
      // Fall through to saved-story storage.
    }
  }

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

function buildBilingualHref(readHref: string): string {
  return `${readHref}${readHref.includes("?") ? "&" : "?"}bilingual=1`;
}

export default function GeneratedStoryBilingualBridge({
  storyId,
}: {
  storyId: string;
}) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let currentHost: HTMLElement | null = null;

    function ensureHost() {
      const section = findDisplaySettingsSection();

      if (!section) {
        if (currentHost && !currentHost.isConnected) {
          currentHost = null;
          setHost(null);
        }
        return;
      }

      const existing = section.querySelector<HTMLElement>(
        "[data-generated-bilingual-settings-host='true']"
      );

      if (existing) {
        if (currentHost !== existing) {
          currentHost = existing;
          setHost(existing);
        }
        return;
      }

      const nextHost = document.createElement("div");
      nextHost.dataset.generatedBilingualSettingsHost = "true";
      const heading = Array.from(section.children).find(
        (child) => child instanceof HTMLHeadingElement
      );

      if (heading) {
        heading.insertAdjacentElement("afterend", nextHost);
      } else {
        section.prepend(nextHost);
      }

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
  }, []);

  async function enableBilingual() {
    if (working) return;

    setWorking(true);
    setMessage("");

    try {
      const generated = readGeneratedStory(storyId);

      if (!generated) {
        setMessage("生成した物語の一時データを読み込めませんでした。");
        return;
      }

      if (generated.readHref) {
        window.location.assign(buildBilingualHref(generated.readHref));
        return;
      }

      const response = await fetch("/api/time-fit-stories/save-private", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storyId: generated.id,
          createdAt: generated.createdAt,
          title: generated.story.title,
          synopsis: generated.story.synopsis ?? "",
          body: generated.story.body,
          estimatedReadingMinutes:
            generated.story.estimatedReadingMinutes ??
            generated.request.timeMinutes ??
            0,
          request: generated.request,
          tags: generated.story.tags ?? [],
          bookmarkUnitIndex: 0,
        }),
      });

      const result = (await response.json()) as SavePrivateResult;

      if (!response.ok || !result.ok || !result.seriesId) {
        setMessage(
          response.status === 401
            ? "英語対訳を使うにはログインが必要です。"
            : result.error || "英語対訳の準備に失敗しました。"
        );
        return;
      }

      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }

      const readHref = result.readHref ?? `/read/${result.seriesId}/1`;
      window.location.assign(buildBilingualHref(readHref));
    } catch {
      setMessage("英語対訳の準備に失敗しました。");
    } finally {
      setWorking(false);
    }
  }

  if (!host) return null;

  return createPortal(
    <div className="mt-4 rounded-2xl border border-black/10 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm text-neutral-700">英語対訳</p>
          <p className="mt-1 text-xs leading-6 text-neutral-500">
            生成直後の作品も、日本語と英語を上下に並べて読めます。
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <span className="rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-medium text-black">
            オフ
          </span>
          <button
            type="button"
            onClick={() => void enableBilingual()}
            disabled={working}
            className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50 disabled:cursor-wait disabled:opacity-60"
          >
            {working ? "準備中…" : "オン"}
          </button>
        </div>
      </div>
      <p className="mt-3 text-xs leading-6 text-neutral-500">
        初回ON時に作品を非公開保存し、以後は同じ対訳キャッシュを再利用します。
      </p>
      {message ? (
        <p className="mt-3 text-sm text-red-700">{message}</p>
      ) : null}
    </div>,
    host
  );
}
