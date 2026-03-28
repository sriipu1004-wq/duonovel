"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type FavoriteBookmarkButtonProps = {
  seriesId: string;
  loginHref?: string;
};

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
      .maybeSingle();

    if (error && error.code !== "PGRST116") {
      setMessage("お気に入り状態の確認に失敗した。");
      setIsBookmarked(false);
      return;
    }

    setIsBookmarked(Boolean(data));
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
        setMessage("お気に入り解除に失敗した。");
        setIsWorking(false);
        return;
      }

      setIsBookmarked(false);
      setIsWorking(false);
      return;
    }

    const { error } = await supabase.from("user_series_bookmarks").upsert(
      {
        user_id: user.id,
        series_id: seriesId,
      },
      {
        onConflict: "user_id,series_id",
        ignoreDuplicates: true,
      }
    );

    if (error) {
      setMessage("お気に入り追加に失敗した。");
      setIsWorking(false);
      return;
    }

    setIsBookmarked(true);
    setIsWorking(false);
  }

  if (isLoggedIn === null) {
    return (
      <div className="flex flex-col gap-2">
        <button
          type="button"
          disabled
          className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm text-neutral-500"
        >
          お気に入り確認中...
        </button>
      </div>
    );
  }

  if (isLoggedIn === false) {
    return (
      <div className="flex flex-col gap-2">
        <Link
          href={loginHref}
          className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm text-neutral-200 transition hover:bg-white hover:text-black"
        >
          ログインしてお気に入り
        </Link>

        <p className="text-xs leading-6 text-neutral-500">
          お気に入り保存はログイン後に使える。
        </p>
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
          "rounded-full px-5 py-3 text-sm transition",
          isBookmarked
            ? "border border-amber-300/30 bg-amber-300/15 text-amber-100 hover:bg-amber-300/20"
            : "border border-white/10 bg-white/5 text-neutral-200 hover:bg-white hover:text-black",
          isWorking ? "opacity-70" : "",
        ].join(" ")}
      >
        {isWorking
          ? "処理中..."
          : isBookmarked
            ? "★ お気に入り済み"
            : "☆ お気に入りに追加"}
      </button>

      {message ? (
        <p className="text-xs leading-6 text-amber-300">{message}</p>
      ) : null}
    </div>
  );
}