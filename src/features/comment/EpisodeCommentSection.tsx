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
import { useUiLocale } from "@/i18n/UiLocaleProvider";
import {
  episodeCommentsDictionaries,
  type EpisodeCommentsDictionary,
} from "@/i18n/dictionaries/episodeComments";

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

function formatDateTime(
  value: string | null | undefined,
  dictionary: EpisodeCommentsDictionary
): string {
  if (!value) return dictionary.dateUnavailable;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return dictionary.dateUnavailable;

  return new Intl.DateTimeFormat(dictionary.dateLocale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function resolveUserDisplayName(
  user: User | null | undefined,
  dictionary: EpisodeCommentsDictionary
): string {
  const metadata = (user?.user_metadata ?? {}) as Record<string, unknown>;

  return (
    pickText(
      metadata.display_name,
      metadata.pen_name,
      metadata.username,
      metadata.name,
      user?.email?.split("@")[0]
    ) || dictionary.userFallback
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

async function fetchComments(
  episodeId: string,
  dictionary: EpisodeCommentsDictionary
): Promise<{
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
      errorMessage: dictionary.fetchCommentsFailed,
    };
  }

  return {
    comments: (data ?? []) as EpisodeCommentRow[],
    errorMessage: null,
  };
}

async function fetchCommentLikeCounts(
  commentIds: string[],
  dictionary: EpisodeCommentsDictionary
): Promise<{
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
      errorMessage: dictionary.fetchLikeCountsFailed,
    };
  }

  return {
    likeCountMap: buildLikeCountMap((data ?? []) as CommentLikeRow[]),
    errorMessage: null,
  };
}

async function fetchOwnLikedCommentIds(
  commentIds: string[],
  userId: string,
  dictionary: EpisodeCommentsDictionary
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
      errorMessage: dictionary.fetchLikedStateFailed,
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
  dictionary,
  onToggleLike,
}: {
  comment: EpisodeCommentRow;
  likeCount: number;
  isLiked: boolean;
  isLoggedIn: boolean | null;
  isWorking: boolean;
  loginHref: string;
  dictionary: EpisodeCommentsDictionary;
  onToggleLike: () => void;
}) {
  const authorName =
    pickText(comment.author_name_snapshot) || dictionary.readerFallback;
  const postedAt = formatDateTime(
    comment.updated_at ?? comment.created_at,
    dictionary
  );

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
              ? dictionary.working
              : isLiked
                ? dictionary.liked
                : dictionary.likeComment}
          </button>
        ) : (
          <Link
            href={loginHref}
            className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm text-neutral-700 transition hover:bg-neutral-50"
          >
            {dictionary.loginToLike}
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
  const dictionary = episodeCommentsDictionaries[useUiLocale()];
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

    const commentResult = await fetchComments(episodeId, dictionary);
    const commentIds = commentResult.comments.map((comment) => comment.id);

    setComments(commentResult.comments);

    const likeCountResult = await fetchCommentLikeCounts(commentIds, dictionary);
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

    const ownLikedResult = await fetchOwnLikedCommentIds(
      commentIds,
      user.id,
      dictionary
    );
    setLikedCommentIds(ownLikedResult.likedCommentIds);

    setMessage(
      commentResult.errorMessage ??
        likeCountResult.errorMessage ??
        ownLikedResult.errorMessage
    );
    setIsBooting(false);
  }, [dictionary, episodeId]);

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
      setMessage(dictionary.enterComment);
      return;
    }

    if (trimmed.length > MAX_COMMENT_LENGTH) {
      setMessage(dictionary.commentTooLong(MAX_COMMENT_LENGTH));
      return;
    }

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      setIsLoggedIn(false);
      setMessage(dictionary.loginRequiredToPost);
      return;
    }

    setIsSaving(true);
    setMessage(null);

    try {
      const profileName = await fetchProfileName(user.id);
      const authorName =
        pickText(profileName, resolveUserDisplayName(user, dictionary)) ||
        dictionary.userFallback;

      const { error } = await supabase.from("user_episode_comments").insert({
        user_id: user.id,
        episode_id: episodeId,
        body: trimmed,
        author_name_snapshot: authorName,
      });

      if (error) {
        setMessage(dictionary.postFailed);
        return;
      }

      setDraft("");
      await loadState();
      setMessage(dictionary.postSucceeded);
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
      setMessage(dictionary.loginRequiredToLike);
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
          setMessage(dictionary.unlikeFailed);
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
        setMessage(dictionary.likeFailed);
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
          <h2 className="mt-2 text-xl font-semibold text-black">
            {dictionary.title}
          </h2>
        </div>

        <span className="rounded-full border border-black/10 bg-neutral-50 px-3 py-1 text-xs text-neutral-600">
          {dictionary.count(comments.length)}
        </span>
      </div>

      {isLoggedIn ? (
        <div className="mt-5 rounded-[24px] border border-black/10 bg-neutral-50 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-black">
                {dictionary.postTitle}
              </p>
              <p className="mt-1 text-xs text-neutral-500">
                {dictionary.maxChars(MAX_COMMENT_LENGTH)}
              </p>
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
            placeholder={dictionary.placeholder}
            className="mt-4 min-h-[84px] w-full resize-none overflow-hidden rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm leading-7 text-black outline-none placeholder:text-neutral-400"
          />

          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="rounded-full border border-black/10 bg-neutral-200 px-4 py-2 text-sm text-black transition hover:bg-neutral-300 disabled:opacity-70"
            >
              {isSaving ? dictionary.posting : dictionary.postComment}
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-5 rounded-[24px] border border-black/10 bg-neutral-50 p-4">
          <Link
            href={loginHref}
            className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm text-neutral-700 transition hover:bg-neutral-50"
          >
            {dictionary.loginToComment}
          </Link>
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-[24px] border border-black/10 bg-neutral-50 p-4">
        <p className="text-sm font-semibold text-black">
          {dictionary.listTitle(episodeNumber)}
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
            {sortField === "created_at"
              ? dictionary.postOrder
              : dictionary.likeOrder}
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
            {dictionary.loading}
          </div>
        ) : sortedComments.length === 0 ? (
          <div className="rounded-[24px] border border-dashed border-black/15 bg-neutral-50 p-4 text-sm leading-7 text-neutral-600">
            {dictionary.empty}
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
              dictionary={dictionary}
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
