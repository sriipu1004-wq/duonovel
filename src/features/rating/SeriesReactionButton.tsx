"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type SeriesReactionButtonProps = {
  seriesId: string;
  loginHref?: string;
};

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

function HeartIcon({
  filled,
  className,
}: {
  filled: boolean;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 20.5c-.3 0-.6-.1-.9-.3C6.4 16.8 3 13.8 3 9.8 3 7 5 5 7.6 5c1.7 0 3.1.8 4.4 2.3C13.3 5.8 14.7 5 16.4 5 19 5 21 7 21 9.8c0 4-3.4 7-8.1 10.4-.3.2-.6.3-.9.3Z" />
    </svg>
  );
}

function ReactionChip({
  liked,
  likeCount,
  disabled = false,
  onClick,
}: {
  liked: boolean;
  likeCount: number;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={liked}
      className={[
        "inline-flex h-[46px] items-center gap-2 rounded-full border px-3.5 text-sm transition",
        liked
          ? "border-pink-200 bg-pink-50"
          : "border-black/10 bg-white hover:bg-neutral-50",
        disabled ? "opacity-70" : "",
      ].join(" ")}
    >
      <HeartIcon
        filled={liked}
        className={[
          "h-4 w-4",
          liked ? "text-pink-500" : "text-neutral-700",
        ].join(" ")}
      />
      <span
        className={[
          "font-medium",
          liked ? "text-pink-600" : "text-neutral-800",
        ].join(" ")}
      >
        {likeCount}
      </span>
    </button>
  );
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
      setMessage("いいね数の取得に失敗した。");
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
      <div className="flex items-center">
        <ReactionChip liked={false} likeCount={likeCount} disabled />
      </div>
    );
  }

  if (isLoggedIn === false) {
    return (
      <div className="flex flex-col gap-2">
        <Link href={loginHref} className="inline-flex w-fit">
          <span className="sr-only">ログインしていいね</span>
          <span className="inline-flex h-[46px] items-center gap-2 rounded-full border border-black/10 bg-white px-3.5 text-sm transition hover:bg-neutral-50">
            <HeartIcon filled={false} className="h-4 w-4 text-neutral-700" />
            <span className="font-medium text-neutral-800">{likeCount}</span>
          </span>
        </Link>

        {message ? (
          <p className="text-xs leading-6 text-neutral-600">{message}</p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <ReactionChip
        liked={isLiked}
        likeCount={likeCount}
        disabled={isWorking}
        onClick={() => {
          void handleToggle();
        }}
      />

      {message ? (
        <p className="text-xs leading-6 text-neutral-600">{message}</p>
      ) : null}
    </div>
  );
}