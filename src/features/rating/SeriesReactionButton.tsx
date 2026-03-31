"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type SeriesReactionButtonProps = {
  seriesId: string;
  loginHref?: string;
};

// DB 上の既存値は今回は変えない
const DB_REACTION_TYPE = "support";

async function fetchLikeCount(seriesId: string): Promise<number> {
  const { count, error } = await supabase
    .from("user_series_reactions")
    .select("id", { count: "exact", head: true })
    .eq("series_id", seriesId)
    .eq("reaction_type", DB_REACTION_TYPE);

  if (error) {
    throw error;
  }

  return count ?? 0;
}

export default function SeriesReactionButton({
  seriesId,
  loginHref = `/login?next=${encodeURIComponent(`/works/${seriesId}`)}`,
}: SeriesReactionButtonProps) {
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);
  const [isLiked, setIsLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [isWorking, setIsWorking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const loadState = useCallback(async () => {
    setMessage(null);

    try {
      const count = await fetchLikeCount(seriesId);
      setLikeCount(count);
    } catch {
      setLikeCount(0);
      setMessage("いいね数の取得に失敗した。migration か RLS を確認して。");
    }

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      setIsLoggedIn(false);
      setIsLiked(false);
      return;
    }

    setIsLoggedIn(true);

    const { data, error } = await supabase
      .from("user_series_reactions")
      .select("id")
      .eq("user_id", user.id)
      .eq("series_id", seriesId)
      .eq("reaction_type", DB_REACTION_TYPE)
      .maybeSingle();

    if (error && error.code !== "PGRST116") {
      setIsLiked(false);
      setMessage("いいね状態の取得に失敗した。");
      return;
    }

    setIsLiked(Boolean(data));
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
      setIsLiked(false);
      return;
    }

    setIsWorking(true);
    setMessage(null);

    try {
      if (isLiked) {
        const { error } = await supabase
          .from("user_series_reactions")
          .delete()
          .eq("user_id", user.id)
          .eq("series_id", seriesId)
          .eq("reaction_type", DB_REACTION_TYPE);

        if (error) {
          setMessage("いいね解除に失敗した。");
          return;
        }
      } else {
        const { error } = await supabase.from("user_series_reactions").upsert(
          {
            user_id: user.id,
            series_id: seriesId,
            reaction_type: DB_REACTION_TYPE,
          },
          {
            onConflict: "user_id,series_id",
          }
        );

        if (error) {
          setMessage("いいね保存に失敗した。");
          return;
        }
      }

      await loadState();
    } finally {
      setIsWorking(false);
    }
  }

  if (isLoggedIn === null) {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled
            className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm text-neutral-500"
          >
            いいね状態を確認中...
          </button>

          <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-neutral-400">
            いいね -- 件
          </span>
        </div>
      </div>
    );
  }

  if (isLoggedIn === false) {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href={loginHref}
            className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm text-neutral-200 transition hover:bg-white hover:text-black"
          >
            ログインしていいね
          </Link>

          <span className="rounded-full border border-rose-300/20 bg-rose-300/10 px-4 py-2 text-sm text-rose-100">
            いいね {likeCount}件
          </span>
        </div>

        <p className="text-xs leading-6 text-neutral-500">
          最小版では 1ユーザー1作品1いいねだけ保存する。
        </p>

        {message ? (
          <p className="text-xs leading-6 text-amber-300">{message}</p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleToggle}
          disabled={isWorking}
          className={[
            "rounded-full px-5 py-3 text-sm transition",
            isLiked
              ? "border border-rose-300/30 bg-rose-300/15 text-rose-100 hover:bg-rose-300/20"
              : "border border-white/10 bg-white/5 text-neutral-200 hover:bg-white hover:text-black",
            isWorking ? "opacity-70" : "",
          ].join(" ")}
        >
          {isWorking
            ? "処理中..."
            : isLiked
              ? "♥ いいね済み"
              : "♡ この作品にいいね"}
        </button>

        <span className="rounded-full border border-rose-300/20 bg-rose-300/10 px-4 py-2 text-sm text-rose-100">
          いいね {likeCount}件
        </span>
      </div>

      <p className="text-xs leading-6 text-neutral-500">
        最小版では 1ユーザー1作品1いいねだけ保存する。
      </p>

      {message ? (
        <p className="text-xs leading-6 text-amber-300">{message}</p>
      ) : null}
    </div>
  );
}