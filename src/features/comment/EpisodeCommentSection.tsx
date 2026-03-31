"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";

type EpisodeCommentSectionProps = {
  episodeId: string;
  loginHref?: string;
};

type EpisodeCommentRow = {
  id: string;
  user_id: string;
  episode_id: string;
  body: string;
  author_name_snapshot?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type CommentLikeRow = {
  comment_id: string;
};

type SortField = "created_at" | "like_count";
type SortDirection = "desc" | "asc";

const MAX_COMMENT_LENGTH = 300;

function pickText(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }

  return "";
}

function formatDateTime(value?: string | null): string {
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

function buildLikeCountMap(rows: CommentLikeRow[]): Record<string, number> {
  const next: Record<string, number> = {};

  for (const row of rows) {
    next[row.comment_id] = (next[row.comment_id] ?? 0) + 1;
  }

  return next;
}

function getCommentTimestamp(comment: EpisodeCommentRow): number {
  const raw = comment.created_at ?? comment.updated_at ?? "";
  const time = new Date(raw).getTime();
  return Number.isNaN(time) ? 0 : time;
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

async function fetchComments(episodeId: string): Promise<{
  comments: EpisodeCommentRow[];
  errorMessage: string | null;
}> {
  const { data, error } = await supabase
    .from("user_episode_comments")
    .select("id, user_id, episode_id, body, author_name_snapshot, created_at, updated_at")
    .eq("episode_id", episodeId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    return {
      comments: [],
      errorMessage: "コメント一覧の取得に失敗した。migration と RLS を確認して。",
    };
  }

  return {
    comments: (data ?? []) as EpisodeCommentRow[],
    errorMessage: null,
  };
}

async function fetchCommentLikeCounts(commentIds: string[]): Promise<{
  likeCountMap: Record<string, number>;
  errorMessage: string | null;
}> {
  if (commentIds.length === 0) {
    return {
      likeCountMap: {},
      errorMessage: null,
    };
  }

  const { data, error } = await supabase
    .from("user_episode_comment_likes")
    .select("comment_id")
    .in("comment_id", commentIds);

  if (error) {
    return {
      likeCountMap: {},
      errorMessage: "コメントいいね数の取得に失敗した。migration と RLS を確認して。",
    };
  }

  return {
    likeCountMap: buildLikeCountMap((data ?? []) as CommentLikeRow[]),
    errorMessage: null,
  };
}

async function fetchOwnLikedCommentIds(
  commentIds: string[],
  userId: string
): Promise<{
  likedCommentIds: string[];
  errorMessage: string | null;
}> {
  if (commentIds.length === 0) {
    return {
      likedCommentIds: [],
      errorMessage: null,
    };
  }

  const { data, error } = await supabase
    .from("user_episode_comment_likes")
    .select("comment_id")
    .eq("user_id", userId)
    .in("comment_id", commentIds);

  if (error) {
    return {
      likedCommentIds: [],
      errorMessage: "自分のコメントいいね状態の取得に失敗した。",
    };
  }

  return {
    likedCommentIds: ((data ?? []) as CommentLikeRow[]).map((row) => row.comment_id),
    errorMessage: null,
  };
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

function CommentItem({
  comment,
  likeCount,
  isLiked,
  isLoggedIn,
  isWorking,
  loginHref,
  onToggleLike,
}: {
  comment: EpisodeCommentRow;
  likeCount: number;
  isLiked: boolean;
  isLoggedIn: boolean | null;
  isWorking: boolean;
  loginHref: string;
  onToggleLike: () => void;
}) {
  const authorName = pickText(comment.author_name_snapshot) || "読者";
  const postedAt = formatDateTime(comment.updated_at ?? comment.created_at);

  return (
    <article className="rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white">{authorName}</p>
          <p className="mt-1 text-xs text-neutral-500">{postedAt}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-neutral-400">
            コメント
          </span>
          <span className="rounded-full border border-rose-300/20 bg-rose-300/10 px-3 py-1 text-xs text-rose-100">
            いいね {likeCount}件
          </span>
        </div>
      </div>

      <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-neutral-300">
        {comment.body}
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
                : "♡ このコメントにいいね"}
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

export default function EpisodeCommentSection({
  episodeId,
  loginHref = "/login",
}: EpisodeCommentSectionProps) {
  const [isBooting, setIsBooting] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);
  const [comments, setComments] = useState<EpisodeCommentRow[]>([]);
  const [draft, setDraft] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [sortField, setSortField] = useState<SortField>("created_at");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [likeCountMap, setLikeCountMap] = useState<Record<string, number>>({});
  const [likedCommentIds, setLikedCommentIds] = useState<string[]>([]);
  const [workingLikeCommentId, setWorkingLikeCommentId] = useState<string | null>(null);

  const loadState = useCallback(async () => {
    setIsBooting(true);
    setMessage(null);

    const commentResult = await fetchComments(episodeId);
    const commentIds = commentResult.comments.map((comment) => comment.id);

    setComments(commentResult.comments);

    const likeCountResult = await fetchCommentLikeCounts(commentIds);
    setLikeCountMap(likeCountResult.likeCountMap);

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      setIsLoggedIn(false);
      setLikedCommentIds([]);
      setMessage(commentResult.errorMessage ?? likeCountResult.errorMessage);
      setIsBooting(false);
      return;
    }

    setIsLoggedIn(true);

    const ownLikedResult = await fetchOwnLikedCommentIds(commentIds, user.id);
    setLikedCommentIds(ownLikedResult.likedCommentIds);

    setMessage(
      commentResult.errorMessage ?? likeCountResult.errorMessage ?? ownLikedResult.errorMessage
    );
    setIsBooting(false);
  }, [episodeId]);

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
      setMessage("感想を入力して。");
      return;
    }

    if (trimmed.length > MAX_COMMENT_LENGTH) {
      setMessage(`感想は ${MAX_COMMENT_LENGTH}文字以内にして。`);
      return;
    }

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      setIsLoggedIn(false);
      setMessage("感想投稿にはログインが必要。");
      return;
    }

    setIsSaving(true);
    setMessage(null);

    try {
      const profileName = await fetchProfileName(user.id);
      const authorName =
        pickText(profileName, resolveUserDisplayName(user)) || "ユーザー";

      const { error } = await supabase.from("user_episode_comments").insert({
        user_id: user.id,
        episode_id: episodeId,
        body: trimmed,
        author_name_snapshot: authorName,
      });

      if (error) {
        setMessage("感想投稿に失敗した。migration と RLS を確認して。");
        return;
      }

      setDraft("");
      await loadState();
      setMessage("感想を投稿した。");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleToggleLike(commentId: string) {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      setIsLoggedIn(false);
      setMessage("コメントへのいいねにはログインが必要。");
      return;
    }

    const alreadyLiked = likedCommentIds.includes(commentId);

    setWorkingLikeCommentId(commentId);
    setMessage(null);

    try {
      if (alreadyLiked) {
        const { error } = await supabase
          .from("user_episode_comment_likes")
          .delete()
          .eq("user_id", user.id)
          .eq("comment_id", commentId);

        if (error) {
          setMessage("コメントいいね解除に失敗した。");
          return;
        }

        setLikedCommentIds((current) => current.filter((id) => id !== commentId));
        setLikeCountMap((current) => ({
          ...current,
          [commentId]: Math.max(0, (current[commentId] ?? 0) - 1),
        }));
        return;
      }

      const { error } = await supabase.from("user_episode_comment_likes").upsert(
        {
          user_id: user.id,
          comment_id: commentId,
        },
        {
          onConflict: "user_id,comment_id",
          ignoreDuplicates: true,
        }
      );

      if (error) {
        setMessage("コメントいいね保存に失敗した。");
        return;
      }

      setLikedCommentIds((current) =>
        current.includes(commentId) ? current : [...current, commentId]
      );
      setLikeCountMap((current) => ({
        ...current,
        [commentId]: (current[commentId] ?? 0) + 1,
      }));
    } finally {
      setWorkingLikeCommentId(null);
    }
  }

  const sortedComments = useMemo(() => {
    const next = [...comments];

    next.sort((a, b) => {
      if (sortField === "like_count") {
        const aLikes = likeCountMap[a.id] ?? 0;
        const bLikes = likeCountMap[b.id] ?? 0;

        if (aLikes !== bLikes) {
          return sortDirection === "asc" ? aLikes - bLikes : bLikes - aLikes;
        }

        const aTime = getCommentTimestamp(a);
        const bTime = getCommentTimestamp(b);
        return sortDirection === "asc" ? aTime - bTime : bTime - aTime;
      }

      const aTime = getCommentTimestamp(a);
      const bTime = getCommentTimestamp(b);

      if (aTime !== bTime) {
        return sortDirection === "asc" ? aTime - bTime : bTime - aTime;
      }

      const aLikes = likeCountMap[a.id] ?? 0;
      const bLikes = likeCountMap[b.id] ?? 0;
      return sortDirection === "asc" ? aLikes - bLikes : bLikes - aLikes;
    });

    return next;
  }, [comments, sortField, sortDirection, likeCountMap]);

  return (
    <section className="mt-8 rounded-[28px] border border-white/10 bg-black/20 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs tracking-[0.18em] text-neutral-500">EPISODE COMMENTS</p>
          <h2 className="mt-2 text-xl font-semibold text-white">この話の感想</h2>
          <p className="mt-3 text-sm leading-7 text-neutral-400">
            この話を読み終えた読者が、そのまま感想を書ける最小版コメント欄。
            コメントごとにいいねでき、投稿順 / いいね順 と 昇順 / 降順 で並び替えられる。
          </p>
        </div>

        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-neutral-300">
          コメント {comments.length}件
        </span>
      </div>

      {isLoggedIn ? (
        <div className="mt-5 rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-white">感想を投稿する</p>
              <p className="mt-1 text-xs text-neutral-500">
                1件ずつ感想を追加していく最小版。今回は編集・削除はまだ入れない。
              </p>
            </div>

            <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-neutral-400">
              300文字まで
            </span>
          </div>

          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={5}
            maxLength={MAX_COMMENT_LENGTH}
            placeholder="この話の感想を書く"
            className="mt-4 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm leading-7 text-white outline-none placeholder:text-neutral-500"
          />

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-neutral-400">
              {draft.length}/{MAX_COMMENT_LENGTH}
            </span>

            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="rounded-full bg-white px-5 py-2 text-sm font-semibold text-black transition hover:opacity-90 disabled:opacity-70"
            >
              {isSaving ? "投稿中..." : "感想を投稿"}
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-5 rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href={loginHref}
              className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm text-neutral-200 transition hover:bg-white hover:text-black"
            >
              ログインして感想を書く
            </Link>

            <span className="rounded-full border border-white/10 bg-black/20 px-3 py-2 text-sm text-neutral-400">
              コメント {comments.length}件
            </span>
          </div>

          <p className="mt-3 text-sm leading-7 text-neutral-400">
            未ログイン時はコメント一覧といいね数だけ見せる。投稿やいいねはログイン後に行う。
          </p>
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-start justify-between gap-3 rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
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

      {message ? (
        <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-amber-300">
          {message}
        </p>
      ) : null}

      <div className="mt-6 grid gap-3">
        {isBooting ? (
          <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-4 text-sm text-neutral-500">
            コメント一覧を読み込み中...
          </div>
        ) : sortedComments.length === 0 ? (
          <div className="rounded-[24px] border border-dashed border-white/10 bg-black/20 p-4 text-sm leading-7 text-neutral-400">
            まだこの話への感想はない。
          </div>
        ) : (
          sortedComments.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              likeCount={likeCountMap[comment.id] ?? 0}
              isLiked={likedCommentIds.includes(comment.id)}
              isLoggedIn={isLoggedIn}
              isWorking={workingLikeCommentId === comment.id}
              loginHref={loginHref}
              onToggleLike={() => {
                void handleToggleLike(comment.id);
              }}
            />
          ))
        )}
      </div>
    </section>
  );
}