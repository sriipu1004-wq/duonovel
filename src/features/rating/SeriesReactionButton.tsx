"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import LikeReactionChip from "@/features/rating/LikeReactionChip";

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
      const response = await fetch("/api/series/reaction", {
        method: isLiked ? "DELETE" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          seriesId,
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | {
            ok?: boolean;
            isLiked?: boolean;
            likeCount?: number;
            error?: string;
          }
        | null;

      if (!response.ok || !payload?.ok) {
        setMessage(
          payload?.error ??
            (isLiked ? "いいね解除に失敗した。" : "いいね保存に失敗した。")
        );
        return;
      }

      setIsLiked(!!payload.isLiked);
      setLikeCount(
        typeof payload.likeCount === "number" ? payload.likeCount : likeCount
      );
    } finally {
      setIsWorking(false);
    }
  }

  if (isLoggedIn === null) {
    return (
      <div className="flex items-center">
        <LikeReactionChip liked={false} likeCount={likeCount} disabled />
      </div>
    );
  }

  if (isLoggedIn === false) {
    return (
      <div className="flex flex-col gap-2">
        <Link href={loginHref} className="inline-flex w-fit">
          <span className="sr-only">ログインしていいね</span>
          <LikeReactionChip liked={false} likeCount={likeCount} />
        </Link>

        {message ? (
          <p className="text-xs leading-6 text-neutral-600">{message}</p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <LikeReactionChip
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