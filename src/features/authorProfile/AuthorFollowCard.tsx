"use client";

import { useState } from "react";

type AuthorFollowCardProps = {
  authorId: string;
  isOwnPage: boolean;
  initialFollowerCount: number;
  initialFollowingCount: number;
  initialIsFollowing: boolean;
};

type FollowApiResponse = {
  ok?: boolean;
  isFollowing?: boolean;
  followerCount?: number;
  error?: string;
};

export default function AuthorFollowCard({
  authorId,
  isOwnPage,
  initialFollowerCount,
  initialFollowingCount,
  initialIsFollowing,
}: AuthorFollowCardProps) {
  const [followerCount, setFollowerCount] = useState(initialFollowerCount);
  const [isFollowing, setIsFollowing] = useState(initialIsFollowing);
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function handleToggleFollow() {
    if (pending || isOwnPage) {
      return;
    }

    setPending(true);
    setErrorMessage("");

    const response = await fetch("/api/authors/follow", {
      method: isFollowing ? "DELETE" : "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        authorId,
      }),
    });

    const payload = (await response.json().catch(() => null)) as
      | FollowApiResponse
      | null;

    if (!response.ok || !payload?.ok) {
      setErrorMessage(payload?.error ?? "フォロー更新に失敗した。");
      setPending(false);
      return;
    }

    setIsFollowing(!!payload.isFollowing);
    setFollowerCount(
      typeof payload.followerCount === "number"
        ? payload.followerCount
        : followerCount
    );
    setPending(false);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="rounded-full border border-black/10 bg-neutral-50 px-4 py-2 text-sm text-neutral-700">
          フォロワー {followerCount}
        </span>

        <span className="rounded-full border border-black/10 bg-neutral-50 px-4 py-2 text-sm text-neutral-700">
          フォロー中 {initialFollowingCount}
        </span>

        {isOwnPage ? null : (
          <button
            type="button"
            onClick={() => void handleToggleFollow()}
            disabled={pending}
            className={[
              "rounded-full px-5 py-3 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60",
              isFollowing
                ? "border border-black/10 bg-white text-neutral-700 hover:bg-neutral-50"
                : "border border-sky-200 bg-sky-50 text-black hover:bg-sky-100",
            ].join(" ")}
          >
            {pending
              ? "更新中..."
              : isFollowing
                ? "フォロー解除"
                : "フォローする"}
          </button>
        )}
      </div>

      {errorMessage ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}
    </div>
  );
}