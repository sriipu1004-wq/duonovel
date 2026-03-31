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
type SortDirection = "desc" | "asc";

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
  return pickText(
    row.display_name,
    row.pen_name,
    row.username,
    row.name
  );
}

async function fetchReviews(seriesId: string): Promise<{
  reviews: SeriesReviewRow[];
  errorMessage: string | null;
}> {
  const { data, error } = await supabase
    .from("user_series_reviews")
    .select(
      "id, user_id, series_id, body, author_name_snapshot, created_at, updated_at"
    )
    .eq("series_id", seriesId)
    .order("updated_at", { ascending: false })
    .limit(50);

  if (error) {
    return {
      reviews: [],
      errorMessage: "レビュー一覧の取得に失敗した。migration と RLS を確認して。",
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
    .select(
      "id, user_id, series_id, body, author_name_snapshot, created_at, updated_at"
    )
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
      errorMessage: "レビューいいね数の取得に失敗した。migration と RLS を確認して。",
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
    <article className="rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white">{authorName}</p>
          <p className="mt-1 text-xs text-neutral-500">{reviewedAt}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-neutral-400">
            レビュー
          </span>
          <span className="rounded-full border border-rose-300/20 bg-rose-300/10 px-3 py-1 text-xs text-rose-100">
            いいね {likeCount}件
          </span>
        </div>
      </div>

      <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-neutral-300">
        {review.body}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {isLoggedIn ? (
          <button
            type="button"
            onClick={onToggleLike}
            disabled={isWorking}
            className={[
              "rounded-full px-4 py-2 text-sm transition",
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
                : "♡ このレビューにいいね"}
          </button>
        ) : (
          <Link
            href={loginHref}
            className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-neutral-200 transition hover:bg-white hover:text-black"
          >
            ログインしていいね
          </Link>
        )}
      </div>
    </article>
  );
}

function SortButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "rounded-full px-4 py-2 text-sm transition",
        active
          ? "bg-white text-black"
          : "border border-white/10 bg-white/5 text-neutral-300 hover:bg-white hover:text-black",
      ].join(" ")}
    >
      {label}
    </button>
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
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
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
        buildErrorMessage([
          reviewResult.errorMessage,
          likeCountResult.errorMessage,
        ])
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
        setMessage("レビュー保存に失敗した。migration と RLS を確認して。");
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

  const otherReviews = reviews.filter(
    (review) => review.id !== ownReview?.id
  );

  const sortedOtherReviews = useMemo(() => {
    const next = [...otherReviews];

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
  }, [otherReviews, sortField, sortDirection, likeCountMap]);

  return (
    <section className="rounded-[28px] border border-white/10 bg-black/20 p-5">
      <button
        type="button"
        onClick={() => setIsExpanded((current) => !current)}
        className="w-full text-left"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs tracking-[0.18em] text-neutral-500">REVIEW</p>
            <h2 className="mt-2 text-lg font-semibold text-white">
              感想・レビュー
            </h2>
            <p className="mt-3 text-sm leading-7 text-neutral-400">
              レビュー欄は開閉できる。レビュー本文の投稿に加えて、各レビューへのいいねと並び替えを扱う。
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-neutral-300">
              レビュー {reviews.length}件
            </span>
            <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-neutral-400">
              {isExpanded ? "閉じる" : "開く"}
            </span>
          </div>
        </div>
      </button>

      {!isExpanded ? null : (
        <div className="mt-5">
          <div className="flex flex-wrap items-start justify-between gap-3 rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
            <div>
              <p className="text-sm font-semibold text-white">表示順</p>
              <p className="mt-2 text-sm leading-7 text-neutral-400">
                投稿順か、いいね順で並び替えできる。さらに昇順 / 降順も切り替えられる。
              </p>
            </div>

            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap gap-2">
                <SortButton
                  active={sortField === "created_at"}
                  label="投稿順"
                  onClick={() => setSortField("created_at")}
                />
                <SortButton
                  active={sortField === "like_count"}
                  label="いいね順"
                  onClick={() => setSortField("like_count")}
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <SortButton
                  active={sortDirection === "desc"}
                  label="降順"
                  onClick={() => setSortDirection("desc")}
                />
                <SortButton
                  active={sortDirection === "asc"}
                  label="昇順"
                  onClick={() => setSortDirection("asc")}
                />
              </div>
            </div>
          </div>

          <div className="mt-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-white">レビュー一覧</p>
                <p className="mt-1 text-xs text-neutral-500">
                  自分以外のレビューを、選択した並び順で表示
                </p>
              </div>

              <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-neutral-400">
                {sortedOtherReviews.length}件
              </span>
            </div>

            <div className="mt-4 grid gap-3">
              {isBooting ? (
                <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-4 text-sm text-neutral-500">
                  一覧を読み込み中...
                </div>
              ) : sortedOtherReviews.length === 0 ? (
                <div className="rounded-[24px] border border-dashed border-white/10 bg-black/20 p-4 text-sm leading-7 text-neutral-400">
                  まだ他の読者のレビューはない。
                </div>
              ) : (
                sortedOtherReviews.map((review) => (
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

          {isBooting && isLoggedIn === null ? (
            <div className="mt-6 rounded-[24px] border border-white/10 bg-white/[0.03] p-4 text-sm text-neutral-500">
              レビュー状態を確認中...
            </div>
          ) : isLoggedIn ? (
            <div className="mt-6 rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-white">自分のレビュー</p>
                  <p className="mt-1 text-xs text-neutral-500">
                    {ownReview
                      ? `最終更新 ${formatReviewDate(
                          ownReview.updated_at ?? ownReview.created_at
                        )}`
                      : "まだ投稿していない"}
                  </p>
                </div>

                <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-neutral-400">
                  1作品1件 / 300文字
                </span>
              </div>

              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                rows={5}
                maxLength={MAX_REVIEW_LENGTH}
                placeholder="読後感や短いレビューを書く"
                className="mt-4 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm leading-7 text-white outline-none placeholder:text-neutral-500"
              />

              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-neutral-400">
                  {draft.length}/{MAX_REVIEW_LENGTH}
                </span>

                <div className="flex flex-wrap gap-2">
                  {ownReview ? (
                    <button
                      type="button"
                      onClick={handleDelete}
                      disabled={isSaving || isDeleting}
                      className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-neutral-200 transition hover:bg-white hover:text-black disabled:opacity-70"
                    >
                      {isDeleting ? "削除中..." : "削除"}
                    </button>
                  ) : null}

                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={isSaving || isDeleting}
                    className="rounded-full bg-white px-5 py-2 text-sm font-semibold text-black transition hover:opacity-90 disabled:opacity-70"
                  >
                    {isSaving
                      ? "保存中..."
                      : ownReview
                        ? "レビューを更新"
                        : "レビューを投稿"}
                  </button>
                </div>
              </div>

              <p className="mt-3 text-xs leading-6 text-neutral-500">
                今回は spoiler 判定、画像添付、通報、通知までは広げない。レビューいいねは本文投稿とは別で保存する。
              </p>
            </div>
          ) : (
            <div className="mt-6 rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
              <div className="flex flex-wrap items-center gap-3">
                <Link
                  href={loginHref}
                  className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm text-neutral-200 transition hover:bg-white hover:text-black"
                >
                  ログインしてレビューを書く
                </Link>

                <span className="rounded-full border border-white/10 bg-black/20 px-3 py-2 text-sm text-neutral-400">
                  レビュー {reviews.length}件
                </span>
              </div>

              <p className="mt-3 text-sm leading-7 text-neutral-400">
                未ログイン時はレビューとレビューへのいいね数だけ見せる。投稿やいいねはログイン後に行う。
              </p>
            </div>
          )}

          {message ? (
            <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-amber-300">
              {message}
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}