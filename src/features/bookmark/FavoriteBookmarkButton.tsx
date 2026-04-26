"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type FavoriteBookmarkButtonProps = {
  seriesId: string;
  loginHref?: string;
};

type BookmarkRow = {
  id: string;
};

type SupabaseLikeError = {
  code?: string;
  message?: string;
};

function isDuplicateBookmarkError(error: SupabaseLikeError | null): boolean {
  if (!error) {
    return false;
  }

  return (
    error.code === "23505" ||
    (typeof error.message === "string" &&
      error.message.toLowerCase().includes("duplicate key"))
  );
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

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      setIsLoggedIn(false);
      setIsBookmarked(false);
      return;
    }

    setIsLoggedIn(true);

    const { data, error } = await supabase
      .from("user_series_bookmarks")
      .select("id")
      .eq("user_id", user.id)
      .eq("series_id", seriesId)
      .limit(1);

    if (error) {
      console.error("[FavoriteBookmarkButton] load failed", error);
      setMessage("ブックマーク状態の確認に失敗した。");
      setIsBookmarked(false);
      return;
    }

    const rows = (data ?? []) as BookmarkRow[];
    setIsBookmarked(rows.length > 0);
  }, [seriesId]);

  useEffect(() => {
    void loadState();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      void loadState();
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [loadState]);

  async function handleToggle() {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      setIsLoggedIn(false);
      setIsBookmarked(false);
      return;
    }

    setIsWorking(true);
    setMessage(null);

    if (isBookmarked) {
      const { error } = await supabase
        .from("user_series_bookmarks")
        .delete()
        .eq("user_id", user.id)
        .eq("series_id", seriesId);

      if (error) {
        console.error("[FavoriteBookmarkButton] remove failed", error);
        setMessage("ブックマーク解除に失敗した。");
        setIsWorking(false);
        return;
      }

      setIsBookmarked(false);
      setIsWorking(false);
      return;
    }

    const existing = await supabase
      .from("user_series_bookmarks")
      .select("id")
      .eq("user_id", user.id)
      .eq("series_id", seriesId)
      .limit(1);

    if (existing.error) {
      console.error("[FavoriteBookmarkButton] precheck failed", existing.error);
      setMessage("ブックマーク状態の確認に失敗した。");
      setIsWorking(false);
      return;
    }

    if ((existing.data ?? []).length > 0) {
      setIsBookmarked(true);
      setIsWorking(false);
      return;
    }

    const { error } = await supabase.from("user_series_bookmarks").insert({
      user_id: user.id,
      series_id: seriesId,
    });

    if (error && !isDuplicateBookmarkError(error)) {
      console.error("[FavoriteBookmarkButton] add failed", error);
      setMessage("ブックマーク追加に失敗した。");
      setIsWorking(false);
      return;
    }

    setIsBookmarked(true);
    setIsWorking(false);
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