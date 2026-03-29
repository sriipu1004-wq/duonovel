"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
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
  is_public?: boolean | null;
  author_name_snapshot?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

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

async function fetchPublicReviews(seriesId: string): Promise<{
  reviews: SeriesReviewRow[];
  errorMessage: string | null;
}> {
  const { data, error } = await supabase
    .from("user_series_reviews")
    .select(
      "id, user_id, series_id, body, is_public, author_name_snapshot, created_at, updated_at"
    )
    .eq("series_id", seriesId)
    .eq("is_public", true)
    .order("updated_at", { ascending: false })
    .limit(20);

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
      "id, user_id, series_id, body, is_public, author_name_snapshot, created_at, updated_at"
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

function ReviewItem({ review }: { review: SeriesReviewRow }) {
  const authorName = pickText(review.author_name_snapshot) || "読者";
  const reviewedAt = formatReviewDate(review.updated_at ?? review.created_at);

  return (
    <article className="rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white">{authorName}</p>
          <p className="mt-1 text-xs text-neutral-500">{reviewedAt}</p>
        </div>

        <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-neutral-400">
          作品レビュー
        </span>
      </div>

      <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-neutral-300">
        {review.body}
      </p>
    </article>
  );
}

export default function SeriesReviewSection({
  seriesId,
  loginHref = `/login?next=${encodeURIComponent(`/works/${seriesId}`)}`,
}: SeriesReviewSectionProps) {
  const [isBooting, setIsBooting] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);
  const [publicReviews, setPublicReviews] = useState<SeriesReviewRow[]>([]);
  const [ownReview, setOwnReview] = useState<SeriesReviewRow | null>(null);
  const [draft, setDraft] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const loadState = useCallback(async () => {
    setIsBooting(true);
    setMessage(null);

    const publicResult = await fetchPublicReviews(seriesId);
    setPublicReviews(publicResult.reviews);

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      setIsLoggedIn(false);
      setOwnReview(null);
      setDraft("");
      setMessage(publicResult.errorMessage);
      setIsBooting(false);
      return;
    }

    setIsLoggedIn(true);

    const ownResult = await fetchOwnReview(seriesId, user.id);
    setOwnReview(ownResult.review);
    setDraft(ownResult.review?.body ?? "");
    setMessage(publicResult.errorMessage ?? ownResult.errorMessage);
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
          is_public: true,
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

  const visibleReviews = publicReviews.filter(
    (review) => review.id !== ownReview?.id
  );

  return (
    <section className="rounded-[28px] border border-white/10 bg-black/20 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs tracking-[0.18em] text-neutral-500">REVIEW</p>
          <h2 className="mt-2 text-lg font-semibold text-white">
            感想・レビュー
          </h2>
          <p className="mt-3 text-sm leading-7 text-neutral-400">
            最小版では 1ユーザー1作品1レビュー、300文字まで。応援とは別テーブルで保存する。
          </p>
        </div>

        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-neutral-300">
          MINIMUM
        </span>
      </div>

      {isBooting && isLoggedIn === null ? (
        <div className="mt-4 rounded-[24px] border border-white/10 bg-white/[0.03] p-4 text-sm text-neutral-500">
          レビュー状態を確認中...
        </div>
      ) : isLoggedIn ? (
        <div className="mt-4 rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
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
            placeholder="読後感や応援メッセージを短く書く"
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
            今回は spoiler 判定、画像添付、通報、通知までは広げない。
          </p>
        </div>
      ) : (
        <div className="mt-4 rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href={loginHref}
              className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm text-neutral-200 transition hover:bg-white hover:text-black"
            >
              ログインしてレビューを書く
            </Link>

            <span className="rounded-full border border-white/10 bg-black/20 px-3 py-2 text-sm text-neutral-400">
              公開レビュー {publicReviews.length}件
            </span>
          </div>

          <p className="mt-3 text-sm leading-7 text-neutral-400">
            未ログイン時は公開レビューだけ見せる。投稿や更新はログイン後に行う。
          </p>
        </div>
      )}

      {message ? (
        <p className="mt-4 text-sm leading-7 text-amber-300">{message}</p>
      ) : null}

      <div className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
<p className="text-sm font-semibold text-white">他の読者の公開レビュー</p>
<p className="mt-1 text-xs text-neutral-500">
  自分のレビューを除いた公開分を新しい順に最大20件
</p>
          </div>

<span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-neutral-400">
  {visibleReviews.length}件
</span>
        </div>

        <div className="mt-4 grid gap-3">
          {isBooting ? (
            <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-4 text-sm text-neutral-500">
              一覧を読み込み中...
            </div>
          ) : visibleReviews.length === 0 ? (
<div className="rounded-[24px] border border-dashed border-white/10 bg-black/20 p-4 text-sm leading-7 text-neutral-400">
  まだ他の読者の公開レビューはない。
</div>
          ) : (
            visibleReviews.map((review) => (
              <ReviewItem key={review.id} review={review} />
            ))
          )}
        </div>
      </div>
    </section>
  );
}