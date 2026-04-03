"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";

type SeriesReviewSectionProps = {
  seriesId: string;
  loginHref?: string;
};

type SeriesReviewRow = {
  id: string;
  user_id: string;
  series_id: string;
  body: string;
  author_name_snapshot?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type ReviewLikeRow = {
  review_id: string;
};

type SortField = "created_at" | "like_count";
type SortDirection = "asc" | "desc";

const MAX_REVIEW_LENGTH = 300;

function pickText(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }
  return "";
}

function formatReviewDate(value?: string | null): string {
  if (!value) return "日時未取得";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "日時未取得";

  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function resolveUserDisplayName(user: User | null | undefined): string {
  const metadata = (user?.user_metadata ?? {}) as Record<string, unknown>;

  return (
    pickText(
      metadata.display_name,
      metadata.pen_name,
      metadata.username,
      metadata.name,
      user?.email?.split("@")[0]
    ) || "ユーザー"
  );
}

function buildErrorMessage(messages: Array<string | null | undefined>): string | null {
  const filtered = messages.filter(
    (message): message is string => typeof message === "string" && message.trim().length > 0
  );

  if (filtered.length === 0) {
    return null;
  }

  return filtered.join("\n");
}

function getReviewTimestamp(review: SeriesReviewRow): number {
  const raw = review.created_at ?? review.updated_at ?? "";
  const time = new Date(raw).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function buildLikeCountMap(rows: ReviewLikeRow[]): Record<string, number> {
  const next: Record<string, number> = {};

  for (const row of rows) {
    next[row.review_id] = (next[row.review_id] ?? 0) + 1;
  }

  return next;
}

async function fetchProfileName(userId: string): Promise<string> {
  const { data, error } = await supabase
    .from("users")
    .select("display_name, pen_name, username, name")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) {
    return "";
  }

  const row = data as Record<string, unknown>;
  return pickText(row.display_name, row.pen_name, row.username, row.name);
}

async function fetchReviews(seriesId: string): Promise<{
  reviews: SeriesReviewRow[];
  errorMessage: string | null;
}> {
  const { data, error } = await supabase
    .from("user_series_reviews")
    .select("id, user_id, series_id, body, author_name_snapshot, created_at, updated_at")
    .eq("series_id", seriesId)
    .order("updated_at", { ascending: false })
    .limit(50);

  if (error) {
    return {
      reviews: [],
      errorMessage: "レビュー一覧の取得に失敗した。",
    };
  }

  return {
    reviews: (data ?? []) as SeriesReviewRow[],
    errorMessage: null,
  };
}

async function fetchOwnReview(
  seriesId: string,
  userId: string
): Promise<{
  review: SeriesReviewRow | null;
  errorMessage: string | null;
}> {
  const { data, error } = await supabase
    .from("user_series_reviews")
    .select("id, user_id, series_id, body, author_name_snapshot, created_at, updated_at")
    .eq("series_id", seriesId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error && error.code !== "PGRST116") {
    return {
      review: null,
      errorMessage: "自分のレビュー取得に失敗した。",
    };
  }

  return {
    review: (data ?? null) as SeriesReviewRow | null,
    errorMessage: null,
  };
}

async function fetchReviewLikeCounts(reviewIds: string[]): Promise<{
  likeCountMap: Record<string, number>;
  errorMessage: string | null;
}> {
  if (reviewIds.length === 0) {
    return {
      likeCountMap: {},
      errorMessage: null,
    };
  }

  const { data, error } = await supabase
    .from("user_series_review_likes")
    .select("review_id")
    .in("review_id", reviewIds);

  if (error) {
    return {
      likeCountMap: {},
      errorMessage: "レビューいいね数の取得に失敗した。",
    };
  }

  return {
    likeCountMap: buildLikeCountMap((data ?? []) as ReviewLikeRow[]),
    errorMessage: null,
  };
}

async function fetchOwnLikedReviewIds(
  reviewIds: string[],
  userId: string
): Promise<{
  likedReviewIds: string[];
  errorMessage: string | null;
}> {
  if (reviewIds.length === 0) {
    return {
      likedReviewIds: [],
      errorMessage: null,
    };
  }

  const { data, error } = await supabase
    .from("user_series_review_likes")
    .select("review_id")
    .eq("user_id", userId)
    .in("review_id", reviewIds);

  if (error) {
    return {
      likedReviewIds: [],
      errorMessage: "自分のレビューいいね状態の取得に失敗した。",
    };
  }

  return {
    likedReviewIds: ((data ?? []) as ReviewLikeRow[]).map((row) => row.review_id),
    errorMessage: null,
  };
}

function ReviewItem({
  review,
  likeCount,
  isLiked,
  isLoggedIn,
  isWorking,
  loginHref,
  onToggleLike,
}: {
  review: SeriesReviewRow;
  likeCount: number;
  isLiked: boolean;
  isLoggedIn: boolean | null;
  isWorking: boolean;
  loginHref: string;
  onToggleLike: () => void;
}) {
  const authorName = pickText(review.author_name_snapshot) || "読者";
  const reviewedAt = formatReviewDate(review.updated_at ?? review.created_at);

  return (
    <article className="rounded-[24px] border border-black/10 bg-neutral-50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-black">{authorName}</p>
          <p className="mt-1 text-xs text-neutral-500">{reviewedAt}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-pink-200 bg-pink-50 px-3 py-1 text-xs text-pink-600">
            ♥ {likeCount}
          </span>
        </div>
      </div>

      <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-neutral-800">
        {review.body}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {isLoggedIn ? (
          <button
            type="button"
            onClick={onToggleLike}
            disabled={isWorking}
            className={[
              "rounded-full border px-4 py-2 text-sm transition",
              isLiked
                ? "border-pink-200 bg-pink-50 text-pink-600"
                : "border-black/10 bg-white text-neutral-700 hover:bg-neutral-50",
              isWorking ? "opacity-70" : "",
            ].join(" ")}
          >
            {isWorking
              ? "処理中..."
              : isLiked
                ? "♥ いいね済み"
                : "♡ このレビューにいいね"}
          </button>
        ) : (
          <Link
            href={loginHref}
            className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm text-neutral-700 transition hover:bg-neutral-50"
          >
            ログインしていいね
          </Link>
        )}
      </div>
    </article>
  );
}

export default function SeriesReviewSection({
  seriesId,
  loginHref = `/login?next=${encodeURIComponent(`/works/${seriesId}`)}`,
}: SeriesReviewSectionProps) {
  const [isBooting, setIsBooting] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [sortField, setSortField] = useState<SortField>("created_at");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [reviews, setReviews] = useState<SeriesReviewRow[]>([]);
  const [ownReview, setOwnReview] = useState<SeriesReviewRow | null>(null);
  const [draft, setDraft] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [likeCountMap, setLikeCountMap] = useState<Record<string, number>>({});
  const [likedReviewIds, setLikedReviewIds] = useState<string[]>([]);
  const [workingLikeReviewId, setWorkingLikeReviewId] = useState<string | null>(null);

  const loadState = useCallback(async () => {
    setIsBooting(true);
    setMessage(null);

    const reviewResult = await fetchReviews(seriesId);
    const reviewIds = reviewResult.reviews.map((review) => review.id);

    setReviews(reviewResult.reviews);

    const likeCountResult = await fetchReviewLikeCounts(reviewIds);
    setLikeCountMap(likeCountResult.likeCountMap);

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      setIsLoggedIn(false);
      setOwnReview(null);
      setDraft("");
      setLikedReviewIds([]);
      setMessage(
        buildErrorMessage([reviewResult.errorMessage, likeCountResult.errorMessage])
      );
      setIsBooting(false);
      return;
    }

    setIsLoggedIn(true);

    const ownResult = await fetchOwnReview(seriesId, user.id);
    setOwnReview(ownResult.review);
    setDraft(ownResult.review?.body ?? "");

    const ownLikedResult = await fetchOwnLikedReviewIds(reviewIds, user.id);
    setLikedReviewIds(ownLikedResult.likedReviewIds);

    setMessage(
      buildErrorMessage([
        reviewResult.errorMessage,
        likeCountResult.errorMessage,
        ownResult.errorMessage,
        ownLikedResult.errorMessage,
      ])
    );
    setIsBooting(false);
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

  async function handleSave() {
    const trimmed = draft.trim();

    if (!trimmed) {
      setMessage("レビュー本文を入力して。");
      return;
    }

    if (trimmed.length > MAX_REVIEW_LENGTH) {
      setMessage(`レビューは ${MAX_REVIEW_LENGTH}文字以内にして。`);
      return;
    }

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      setIsLoggedIn(false);
      setMessage("レビュー投稿にはログインが必要。");
      return;
    }

    const hadOwnReview = Boolean(ownReview);

    setIsSaving(true);
    setMessage(null);

    try {
      const profileName = await fetchProfileName(user.id);
      const authorName =
        pickText(profileName, resolveUserDisplayName(user)) || "ユーザー";

      const { error } = await supabase.from("user_series_reviews").upsert(
        {
          user_id: user.id,
          series_id: seriesId,
          body: trimmed,
          author_name_snapshot: authorName,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "user_id,series_id",
        }
      );

      if (error) {
        setMessage("レビュー保存に失敗した。");
        return;
      }

      await loadState();
      setMessage(hadOwnReview ? "レビューを更新した。" : "レビューを投稿した。");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete() {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      setIsLoggedIn(false);
      setMessage("レビュー削除にはログインが必要。");
      return;
    }

    setIsDeleting(true);
    setMessage(null);

    try {
      const { error } = await supabase
        .from("user_series_reviews")
        .delete()
        .eq("user_id", user.id)
        .eq("series_id", seriesId);

      if (error) {
        setMessage("レビュー削除に失敗した。");
        return;
      }

      await loadState();
      setDraft("");
      setMessage("レビューを削除した。");
    } finally {
      setIsDeleting(false);
    }
  }

  async function handleToggleLike(reviewId: string) {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      setIsLoggedIn(false);
      setMessage("レビューへのいいねにはログインが必要。");
      return;
    }

    const alreadyLiked = likedReviewIds.includes(reviewId);

    setWorkingLikeReviewId(reviewId);
    setMessage(null);

    try {
      if (alreadyLiked) {
        const { error } = await supabase
          .from("user_series_review_likes")
          .delete()
          .eq("user_id", user.id)
          .eq("review_id", reviewId);

        if (error) {
          setMessage("レビューいいね解除に失敗した。");
          return;
        }

        setLikedReviewIds((current) => current.filter((id) => id !== reviewId));
        setLikeCountMap((current) => ({
          ...current,
          [reviewId]: Math.max(0, (current[reviewId] ?? 0) - 1),
        }));
        return;
      }

      const { error } = await supabase.from("user_series_review_likes").upsert(
        {
          user_id: user.id,
          review_id: reviewId,
        },
        {
          onConflict: "user_id,review_id",
          ignoreDuplicates: true,
        }
      );

      if (error) {
        setMessage("レビューいいね保存に失敗した。");
        return;
      }

      setLikedReviewIds((current) =>
        current.includes(reviewId) ? current : [...current, reviewId]
      );
      setLikeCountMap((current) => ({
        ...current,
        [reviewId]: (current[reviewId] ?? 0) + 1,
      }));
    } finally {
      setWorkingLikeReviewId(null);
    }
  }

  function handleToggleSortField() {
    setSortField((current) =>
      current === "created_at" ? "like_count" : "created_at"
    );
  }

  function handleToggleSortDirection() {
    setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
  }

  const topLikedReview = useMemo(() => {
    if (reviews.length === 0) return null;

    const next = [...reviews];
    next.sort((a, b) => {
      const aLikes = likeCountMap[a.id] ?? 0;
      const bLikes = likeCountMap[b.id] ?? 0;

      if (aLikes !== bLikes) {
        return bLikes - aLikes;
      }

      return getReviewTimestamp(b) - getReviewTimestamp(a);
    });

    return next[0] ?? null;
  }, [reviews, likeCountMap]);

  const sortedReviews = useMemo(() => {
    const next = [...reviews];

    next.sort((a, b) => {
      if (sortField === "like_count") {
        const aLikes = likeCountMap[a.id] ?? 0;
        const bLikes = likeCountMap[b.id] ?? 0;

        if (aLikes !== bLikes) {
          return sortDirection === "asc" ? aLikes - bLikes : bLikes - aLikes;
        }

        const aTime = getReviewTimestamp(a);
        const bTime = getReviewTimestamp(b);
        return sortDirection === "asc" ? aTime - bTime : bTime - aTime;
      }

      const aTime = getReviewTimestamp(a);
      const bTime = getReviewTimestamp(b);

      if (aTime !== bTime) {
        return sortDirection === "asc" ? aTime - bTime : bTime - aTime;
      }

      const aLikes = likeCountMap[a.id] ?? 0;
      const bLikes = likeCountMap[b.id] ?? 0;
      return sortDirection === "asc" ? aLikes - bLikes : bLikes - aLikes;
    });

    return next;
  }, [reviews, sortField, sortDirection, likeCountMap]);

  const shouldHideOwnReviewEditor = !isExpanded && Boolean(topLikedReview);

  return (
    <section className="rounded-[28px] border border-black/10 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs tracking-[0.18em] text-neutral-500">REVIEW</p>
          <h2 className="mt-2 text-lg font-semibold text-black">感想・レビュー</h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-black/10 bg-neutral-50 px-3 py-1 text-xs text-neutral-600">
            レビュー {reviews.length}件
          </span>
          <button
            type="button"
            onClick={() => setIsExpanded((current) => !current)}
            className="rounded-full border border-black/10 bg-white px-3 py-1 text-xs text-neutral-600 transition hover:bg-neutral-50"
          >
            {isExpanded ? "閉じる" : "開く"}
          </button>
        </div>
      </div>

      {!isExpanded && topLikedReview ? (
        <div className="mt-5 rounded-[24px] border border-black/10 bg-neutral-50 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold text-black">
                  {pickText(topLikedReview.author_name_snapshot) || "読者"}
                </p>
                <span className="rounded-full border border-pink-200 bg-pink-50 px-3 py-1 text-xs text-pink-600">
                  ♥ {likeCountMap[topLikedReview.id] ?? 0}
                </span>
              </div>

              <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-neutral-700">
                {topLikedReview.body}
              </p>
            </div>

            <button
              type="button"
              onClick={() => setIsExpanded(true)}
              className="shrink-0 rounded-full border border-black/10 bg-white px-4 py-2 text-sm text-neutral-700 transition hover:bg-neutral-50"
            >
              …続きを読む
            </button>
          </div>
        </div>
      ) : null}

      {isExpanded ? (
        <div className="mt-5">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[24px] border border-black/10 bg-neutral-50 p-4">
            <p className="text-sm font-semibold text-black">レビュー一覧</p>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleToggleSortDirection}
                className="rounded-full border border-black/10 bg-white px-3 py-2 text-sm text-neutral-700 transition hover:bg-neutral-50"
              >
                {sortDirection === "asc" ? "↓" : "↑"}
              </button>

              <button
                type="button"
                onClick={handleToggleSortField}
                className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm text-neutral-700 transition hover:bg-neutral-50"
              >
                {sortField === "created_at" ? "投稿順" : "いいね順"}
              </button>
            </div>
          </div>

          <div className="mt-4 grid gap-3">
            {isBooting ? (
              <div className="rounded-[24px] border border-black/10 bg-neutral-50 p-4 text-sm text-neutral-500">
                一覧を読み込み中...
              </div>
            ) : sortedReviews.length === 0 ? (
              <div className="rounded-[24px] border border-dashed border-black/15 bg-neutral-50 p-4 text-sm leading-7 text-neutral-600">
                まだレビューはない。
              </div>
            ) : (
              sortedReviews.map((review) => (
                <ReviewItem
                  key={review.id}
                  review={review}
                  likeCount={likeCountMap[review.id] ?? 0}
                  isLiked={likedReviewIds.includes(review.id)}
                  isLoggedIn={isLoggedIn}
                  isWorking={workingLikeReviewId === review.id}
                  loginHref={loginHref}
                  onToggleLike={() => {
                    void handleToggleLike(review.id);
                  }}
                />
              ))
            )}
          </div>
        </div>
      ) : null}

      {isBooting && isLoggedIn === null ? (
        <div className="mt-6 rounded-[24px] border border-black/10 bg-neutral-50 p-4 text-sm text-neutral-500">
          レビュー状態を確認中...
        </div>
      ) : isLoggedIn ? (
        shouldHideOwnReviewEditor ? null : (
          <div className="mt-6 rounded-[24px] border border-black/10 bg-neutral-50 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-black">自分のレビュー</p>
                <p className="mt-1 text-xs text-neutral-500">
                  {ownReview
                    ? `最終更新 ${formatReviewDate(
                        ownReview.updated_at ?? ownReview.created_at
                      )}`
                    : "まだ投稿していない"}
                </p>
              </div>

              <span className="rounded-full border border-black/10 bg-white px-3 py-1 text-xs text-neutral-500">
                1作品1件 / 300文字
              </span>
            </div>

            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              rows={5}
              maxLength={MAX_REVIEW_LENGTH}
              placeholder="読後感や短いレビューを書く"
              className="mt-4 w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm leading-7 text-black outline-none placeholder:text-neutral-400"
            />

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <span className="rounded-full border border-black/10 bg-white px-3 py-1 text-xs text-neutral-500">
                {draft.length}/{MAX_REVIEW_LENGTH}
              </span>

              <div className="flex flex-wrap gap-2">
                {ownReview ? (
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={isSaving || isDeleting}
                    className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm text-neutral-700 transition hover:bg-neutral-50 disabled:opacity-70"
                  >
                    {isDeleting ? "削除中..." : "削除"}
                  </button>
                ) : null}

                <button
                  type="button"
                  onClick={handleSave}
                  disabled={isSaving || isDeleting}
                  className="rounded-full border border-black/10 bg-neutral-200 px-4 py-2 text-sm text-black transition hover:bg-neutral-300 disabled:opacity-70"
                >
                  {isSaving
                    ? "保存中..."
                    : ownReview
                      ? "レビューを更新"
                      : "レビューを投稿"}
                </button>
              </div>
            </div>
          </div>
        )
      ) : (
        <div className="mt-6 rounded-[24px] border border-black/10 bg-neutral-50 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href={loginHref}
              className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm text-neutral-700 transition hover:bg-neutral-50"
            >
              ログインしてレビューを書く
            </Link>

            <span className="rounded-full border border-black/10 bg-white px-3 py-2 text-sm text-neutral-500">
              レビュー {reviews.length}件
            </span>
          </div>
        </div>
      )}

      {message ? (
        <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-neutral-600">
          {message}
        </p>
      ) : null}
    </section>
  );
}