"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { SeriesContentRating } from "@/lib/contentRating";

type Props = {
  seriesId?: string | null;
  initialRating: SeriesContentRating;
  isAiGenerated?: boolean;
};

const PENDING_KEY = "duonovel:pending-content-rating-create";

function findStatusSection(): HTMLElement | null {
  const headings = Array.from(document.querySelectorAll<HTMLElement>("main h2"));
  const heading = headings.find((node) => node.textContent?.trim() === "作品状態");
  return heading?.parentElement instanceof HTMLElement ? heading.parentElement : null;
}

function ensureHost(section: HTMLElement): HTMLElement {
  const existing = section.querySelector<HTMLElement>(
    ":scope > [data-content-rating-workspace-host='true']"
  );
  if (existing) return existing;

  const host = document.createElement("div");
  host.dataset.contentRatingWorkspaceHost = "true";
  host.className = "mt-4";
  section.appendChild(host);
  return host;
}

export default function ContentRatingWorkspaceBridge({
  seriesId,
  initialRating,
  isAiGenerated = false,
}: Props) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [rating, setRating] = useState<SeriesContentRating>(
    isAiGenerated ? "general" : initialRating
  );
  const [savedRating, setSavedRating] = useState<SeriesContentRating>(
    isAiGenerated ? "general" : initialRating
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const next = isAiGenerated ? "general" : initialRating;
    setRating(next);
    setSavedRating(next);
    setMessage("");
  }, [initialRating, isAiGenerated, seriesId]);

  useEffect(() => {
    function handleApplied(event: Event) {
      const detail = (event as CustomEvent<{ rating?: unknown }>).detail;
      if (detail?.rating === "r18") {
        setRating("r18");
        setSavedRating("r18");
        setMessage("保存済み");
      }
    }

    window.addEventListener("libread:content-rating-applied", handleApplied);
    return () =>
      window.removeEventListener("libread:content-rating-applied", handleApplied);
  }, []);

  useEffect(() => {
    let currentHost: HTMLElement | null = null;

    function ensureUi() {
      const section = findStatusSection();
      if (!section) return;
      const nextHost = ensureHost(section);
      if (nextHost !== currentHost) {
        currentHost = nextHost;
        setHost(nextHost);
      }
    }

    ensureUi();
    const observer = new MutationObserver(ensureUi);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      currentHost = null;
    };
  }, []);

  useEffect(() => {
    if (seriesId || isAiGenerated) return;

    function rememberCreateSelection(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const button = target.closest<HTMLButtonElement>("button");
      if (!button || !button.textContent?.includes("作品を作成")) return;

      if (rating === "general") {
        window.sessionStorage.removeItem(PENDING_KEY);
        return;
      }

      window.sessionStorage.setItem(
        PENDING_KEY,
        JSON.stringify({
          rating,
          startedAt: Date.now(),
          sourcePath: window.location.pathname,
        })
      );
    }

    document.addEventListener("click", rememberCreateSelection, true);
    return () => document.removeEventListener("click", rememberCreateSelection, true);
  }, [isAiGenerated, rating, seriesId]);

  async function updateRating(nextRating: SeriesContentRating) {
    if (saving || isAiGenerated || nextRating === rating) return;

    if (!seriesId) {
      setRating(nextRating);
      setMessage("");
      return;
    }

    setSaving(true);
    setMessage("");

    try {
      const response = await fetch(
        "/api/series/" + encodeURIComponent(seriesId) + "/content-rating",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rating: nextRating }),
        }
      );
      const payload = (await response.json()) as {
        ok?: boolean;
        rating?: SeriesContentRating;
        message?: string;
      };

      if (!response.ok || !payload.ok) {
        setMessage(payload.message || "対象年齢を更新できませんでした。");
        return;
      }

      const saved = payload.rating === "r18" ? "r18" : "general";
      setRating(saved);
      setSavedRating(saved);
      setMessage("保存済み");
    } catch {
      setMessage("対象年齢を更新できませんでした。");
    } finally {
      setSaving(false);
    }
  }

  if (!host) return null;

  return createPortal(
    <div className="rounded-2xl border border-black/10 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] tracking-[0.16em] text-neutral-500">
            対象年齢
          </p>
          <p className="mt-1 text-sm font-semibold text-black">
            {rating === "r18" ? "R18" : "全年齢"}
          </p>
        </div>
        {rating === "r18" ? (
          <span className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700">
            R18
          </span>
        ) : null}
      </div>

      {isAiGenerated ? (
        <div className="mt-3 rounded-2xl border border-black/10 bg-neutral-50 px-3 py-3">
          <p className="text-sm font-semibold text-black">全年齢（固定）</p>
          <p className="mt-1 text-xs leading-6 text-neutral-600">
            AI生成作品は現在、全年齢設定で固定されています。
          </p>
        </div>
      ) : (
        <>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {([
              ["general", "全年齢"],
              ["r18", "R18"],
            ] as const).map(([value, label]) => {
              const active = rating === value;
              return (
                <button
                  key={value}
                  type="button"
                  disabled={saving}
                  onClick={() => void updateRating(value)}
                  className={[
                    "rounded-2xl border px-3 py-3 text-left text-sm transition disabled:cursor-not-allowed disabled:opacity-50",
                    active
                      ? value === "r18"
                        ? "border-red-200 bg-red-50 text-red-800"
                        : "border-sky-200 bg-sky-50 text-black"
                      : "border-black/10 bg-white text-neutral-700 hover:bg-neutral-50",
                  ].join(" ")}
                >
                  <span className="block font-semibold">{label}</span>
                </button>
              );
            })}
          </div>

          {rating === "r18" ? (
            <p className="mt-3 text-xs leading-6 text-neutral-600">
              18歳未満の閲覧を想定しない性的表現を含む作品として扱います。公開一覧では、閲覧者が設定で「性的コンテンツを表示する」を有効にした場合だけ表示されます。
            </p>
          ) : null}

          {seriesId && rating !== savedRating ? (
            <button
              type="button"
              onClick={() => {
                setRating(savedRating);
                setMessage("");
              }}
              className="mt-3 rounded-full border border-black/10 bg-white px-3 py-1.5 text-xs text-neutral-700 transition hover:bg-neutral-50"
            >
              保存済みに戻す
            </button>
          ) : null}
        </>
      )}

      {message ? (
        <p
          className={[
            "mt-3 text-xs",
            message === "保存済み" ? "text-emerald-700" : "text-red-700",
          ].join(" ")}
        >
          {message}
        </p>
      ) : null}
    </div>,
    host
  );
}
