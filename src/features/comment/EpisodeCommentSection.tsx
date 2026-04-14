"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";

type EpisodeCommentSectionProps = {
  episodeId: string;
  episodeNumber: number;
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
    .select(
      "id, user_id, episode_id, body, author_name_snapshot, created_at, updated_at"
    )
    .eq("episode_id", episodeId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    return {
      comments: [],
      errorMessage: "コメント一覧の取得に失敗した。",
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
      errorMessage: "コメントいいね数の取得に失敗した。",
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
    likedCommentIds: ((data ?? []) as CommentLikeRow[]).map(
      (row) => row.comment_id
    ),
    errorMessage: null,
  };
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
    <article className="rounded-[24px] border border-black/10 bg-neutral-50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-black">{authorName}</p>
          <p className="mt-1 text-xs text-neutral-500">{postedAt}</p>
        </div>

        <span className="rounded-full border border-pink-200 bg-pink-50 px-3 py-1 text-xs text-pink-600">
          ♥ {likeCount}
        </span>
      </div>

      <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-neutral-800">
        {comment.body}
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
                : "♡ この感想にいいね"}
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

export default function EpisodeCommentSection({
  episodeId,
  episodeNumber,
  loginHref = "/login",
}: EpisodeCommentSectionProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

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
  const [workingLikeCommentId, setWorkingLikeCommentId] = useState<string | null>(
    null
  );

  const syncTextareaHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = "0px";
    textarea.style.height = `${Math.max(textarea.scrollHeight, 84)}px`;
  }, []);

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
      commentResult.errorMessage ??
        likeCountResult.errorMessage ??
        ownLikedResult.errorMessage
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

  useEffect(() => {
    syncTextareaHeight();
  }, [draft, syncTextareaHeight]);

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
        setMessage("感想投稿に失敗した。");
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
      setMessage("感想へのいいねにはログインが必要。");
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
          setMessage("感想いいね解除に失敗した。");
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
        setMessage("感想いいね保存に失敗した。");
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

  function handleToggleSortField() {
    setSortField((current) =>
      current === "created_at" ? "like_count" : "created_at"
    );
  }

  function handleToggleSortDirection() {
    setSortDirection((current) => (current === "desc" ? "asc" : "desc"));
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
    <section className="mt-8 rounded-[28px] border border-black/10 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs tracking-[0.18em] text-neutral-500">
            EPISODE COMMENTS
          </p>
          <h2 className="mt-2 text-xl font-semibold text-black">この話の感想</h2>
        </div>

        <span className="rounded-full border border-black/10 bg-neutral-50 px-3 py-1 text-xs text-neutral-600">
          感想 {comments.length}件
        </span>
      </div>

      {isLoggedIn ? (
        <div className="mt-5 rounded-[24px] border border-black/10 bg-neutral-50 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-black">感想を投稿する</p>
              <p className="mt-1 text-xs text-neutral-500">300文字まで</p>
            </div>

            <span className="rounded-full border border-black/10 bg-white px-3 py-1 text-xs text-neutral-500">
              {draft.length}/{MAX_COMMENT_LENGTH}
            </span>
          </div>

          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={2}
            maxLength={MAX_COMMENT_LENGTH}
            placeholder="この話の感想を書く"
            className="mt-4 min-h-[84px] w-full resize-none overflow-hidden rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm leading-7 text-black outline-none placeholder:text-neutral-400"
          />

          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="rounded-full border border-black/10 bg-neutral-200 px-4 py-2 text-sm text-black transition hover:bg-neutral-300 disabled:opacity-70"
            >
              {isSaving ? "投稿中..." : "感想を投稿"}
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-5 rounded-[24px] border border-black/10 bg-neutral-50 p-4">
          <Link
            href={loginHref}
            className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm text-neutral-700 transition hover:bg-neutral-50"
          >
            ログインして感想を書く
          </Link>
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-[24px] border border-black/10 bg-neutral-50 p-4">
        <p className="text-sm font-semibold text-black">
          {episodeNumber}話感想一覧
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleToggleSortDirection}
            className="rounded-full border border-black/10 bg-white px-3 py-2 text-sm text-neutral-700 transition hover:bg-neutral-50"
          >
            {sortDirection === "desc" ? "↓" : "↑"}
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

      {message ? (
        <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-neutral-600">
          {message}
        </p>
      ) : null}

      <div className="mt-6 grid gap-3">
        {isBooting ? (
          <div className="rounded-[24px] border border-black/10 bg-neutral-50 p-4 text-sm text-neutral-500">
            感想一覧を読み込み中...
          </div>
        ) : sortedComments.length === 0 ? (
          <div className="rounded-[24px] border border-dashed border-black/15 bg-neutral-50 p-4 text-sm leading-7 text-neutral-600">
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