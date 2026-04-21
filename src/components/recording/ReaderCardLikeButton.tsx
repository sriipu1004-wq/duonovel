"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import LikeReactionChip from "@/features/rating/LikeReactionChip";

type ReaderCardLikeButtonProps = {
  seriesId: string;
  readerKey: string;
  initialLikeCount: number;
  initialIsLiked: boolean;
  loginHref: string;
};

type LikeApiResponse = {
  ok?: boolean;
  isLiked?: boolean;
  likeCount?: number;
  error?: string;
};

export default function ReaderCardLikeButton({
  seriesId,
  readerKey,
  initialLikeCount,
  initialIsLiked,
  loginHref,
}: ReaderCardLikeButtonProps) {
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);
  const [likeCount, setLikeCount] = useState(initialLikeCount);
  const [isLiked, setIsLiked] = useState(initialIsLiked);
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let active = true;

    async function loadAuthState() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!active) {
        return;
      }

      setIsLoggedIn(!!user);
    }

    void loadAuthState();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) {
        return;
      }

      setIsLoggedIn(!!session?.user);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  async function handleToggleLike() {
    if (pending) {
      return;
    }

    setPending(true);
    setErrorMessage("");

    const response = await fetch("/api/readers/like", {
      method: isLiked ? "DELETE" : "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        seriesId,
        readerKey,
      }),
    });

    const payload = (await response.json().catch(() => null)) as
      | LikeApiResponse
      | null;

    if (!response.ok || !payload?.ok) {
      setErrorMessage(
        payload?.error ??
          (isLiked ? "いいね解除に失敗した。" : "いいね保存に失敗した。")
      );
      setPending(false);
      return;
    }

    setIsLiked(!!payload.isLiked);
    setLikeCount(
      typeof payload.likeCount === "number" ? payload.likeCount : likeCount
    );
    setPending(false);
  }

  if (isLoggedIn === null) {
    return <LikeReactionChip liked={false} likeCount={likeCount} disabled />;
  }

  if (isLoggedIn === false) {
    return (
      <Link href={loginHref} className="inline-flex">
        <span className="sr-only">ログインしていいね</span>
        <LikeReactionChip liked={false} likeCount={likeCount} />
      </Link>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <LikeReactionChip
        liked={isLiked}
        likeCount={likeCount}
        disabled={pending}
        onClick={() => {
          void handleToggleLike();
        }}
      />

      {errorMessage ? (
        <p className="text-xs leading-5 text-neutral-600">{errorMessage}</p>
      ) : null}
    </div>
  );
}