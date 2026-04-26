"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type FavoriteBookmarkButtonProps = {
  seriesId: string;
  loginHref?: string;
};

type BookmarkApiResponse = {
  ok?: boolean;
  isBookmarked?: boolean;
  error?: string;
};

async function readBookmarkApiResponse(response: Response): Promise<BookmarkApiResponse> {
  try {
    return (await response.json()) as BookmarkApiResponse;
  } catch {
    return {};
  }
}

export default function FavoriteBookmarkButton({
  seriesId,
  loginHref = `/login?next=${encodeURIComponent(`/works/${seriesId}`)}`,
}: FavoriteBookmarkButtonProps) {
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [isWorking, setIsWorking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const loadState = useCallback(async () => {
    setMessage(null);

    try {
      const response = await fetch(
        `/api/bookmarks/series?seriesId=${encodeURIComponent(seriesId)}`,
        {
          method: "GET",
          cache: "no-store",
        }
      );

      const payload = await readBookmarkApiResponse(response);

      if (response.status === 401) {
        setIsLoggedIn(false);
        setIsBookmarked(false);
        return;
      }

      if (!response.ok || payload.ok === false) {
        setIsLoggedIn(true);
        setIsBookmarked(false);
        setMessage("ブックマーク状態の確認に失敗した。");
        return;
      }

      setIsLoggedIn(true);
      setIsBookmarked(payload.isBookmarked === true);
    } catch (error) {
      console.error("[FavoriteBookmarkButton] load failed", error);
      setIsLoggedIn(true);
      setIsBookmarked(false);
      setMessage("ブックマーク状態の確認に失敗した。");
    }
  }, [seriesId]);

  useEffect(() => {
    void loadState();
  }, [loadState]);

  async function handleToggle() {
    setIsWorking(true);
    setMessage(null);

    try {
      const response = await fetch("/api/bookmarks/series", {
        method: isBookmarked ? "DELETE" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          seriesId,
        }),
      });

      const payload = await readBookmarkApiResponse(response);

      if (response.status === 401) {
        setIsLoggedIn(false);
        setIsBookmarked(false);
        setIsWorking(false);
        return;
      }

      if (!response.ok || payload.ok === false) {
        setMessage(
          isBookmarked
            ? "ブックマーク解除に失敗した。"
            : "ブックマーク追加に失敗した。"
        );
        setIsWorking(false);
        return;
      }

      setIsLoggedIn(true);
      setIsBookmarked(payload.isBookmarked === true);
      setIsWorking(false);
    } catch (error) {
      console.error("[FavoriteBookmarkButton] toggle failed", error);
      setMessage(
        isBookmarked
          ? "ブックマーク解除に失敗した。"
          : "ブックマーク追加に失敗した。"
      );
      setIsWorking(false);
    }
  }

  if (isLoggedIn === null) {
    return (
      <button
        type="button"
        disabled
        className="rounded-full border border-black/10 bg-white px-4 py-2.5 text-sm text-neutral-500"
      >
        確認中...
      </button>
    );
  }

  if (isLoggedIn === false) {
    return (
      <div className="flex flex-col gap-2">
        <Link
          href={loginHref}
          className="inline-flex h-[46px] items-center rounded-full border border-black/10 bg-white px-4 text-sm text-neutral-800 transition hover:bg-neutral-50"
        >
          ブックマークに追加
        </Link>

        {message ? (
          <p className="text-xs leading-6 text-neutral-600">{message}</p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={handleToggle}
        disabled={isWorking}
        className={[
          "inline-flex h-[46px] items-center rounded-full border px-4 text-sm transition",
          isBookmarked
            ? "border-sky-200 bg-sky-50 text-black"
            : "border-black/10 bg-white text-neutral-800 hover:bg-neutral-50",
          isWorking ? "opacity-70" : "",
        ].join(" ")}
      >
        {isWorking
          ? "処理中..."
          : isBookmarked
            ? "ブックマーク済み"
            : "ブックマークに追加"}
      </button>

      {message ? (
        <p className="text-xs leading-6 text-neutral-600">{message}</p>
      ) : null}
    </div>
  );
}