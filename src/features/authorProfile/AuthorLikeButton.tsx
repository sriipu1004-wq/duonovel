"use client";

import Link from "next/link";
import { useState } from "react";
import LikeReactionChip from "@/features/rating/LikeReactionChip";

type AuthorLikeButtonProps = {
  authorId: string;
  isOwnPage: boolean;
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

export default function AuthorLikeButton({
  authorId,
  isOwnPage,
  initialLikeCount,
  initialIsLiked,
  loginHref,
}: AuthorLikeButtonProps) {
  const [likeCount, setLikeCount] = useState(initialLikeCount);
  const [isLiked, setIsLiked] = useState(initialIsLiked);
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  if (isOwnPage) {
    return null;
  }

  async function handleToggleLike() {
    if (pending) {
      return;
    }

    setPending(true);
    setErrorMessage("");

    const response = await fetch("/api/authors/like", {
      method: isLiked ? "DELETE" : "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        authorId,
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

      {!isLiked && !pending ? (
        <Link
          href={loginHref}
          className="hidden"
          aria-hidden="true"
          tabIndex={-1}
        >
          ログイン
        </Link>
      ) : null}
    </div>
  );
}