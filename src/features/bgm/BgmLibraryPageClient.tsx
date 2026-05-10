"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import {
  sortBgmLibraryTracksByFavorites,
  type BgmLibraryTrack,
} from "@/lib/bgm/bgmLibrary";

const LOOP_FILTERS = [
  { value: "all", label: "すべて" },
  { value: "loopable", label: "ループ可のみ" },
  { value: "non-loopable", label: "ループ不可のみ" },
] as const;

type LoopFilter = (typeof LOOP_FILTERS)[number]["value"];

function matchesLoopFilter(track: BgmLibraryTrack, loopFilter: LoopFilter): boolean {
  if (loopFilter === "loopable") return track.loopable;
  if (loopFilter === "non-loopable") return !track.loopable;
  return true;
}

function includesQuery(track: BgmLibraryTrack, query: string): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;

  const haystack = [
    track.title,
    track.mood,
    track.useCase,
    track.durationLabel,
    track.sourceLabel,
    track.rightsLabel,
    ...track.tags,
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(normalized);
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return "お気に入りの更新に失敗した。";
}

function FilterBadge({ children }: { children: ReactNode }) {
  return (
    <span className="max-w-full rounded-full border border-black/10 bg-white px-3 py-1 text-xs text-neutral-600">
      {children}
    </span>
  );
}

function FavoriteButton({
  isFavorite,
  isPending,
  onClick,
}: {
  isFavorite: boolean;
  isPending: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      disabled={isPending}
      className={[
        "rounded-full border px-4 py-2 text-sm transition",
        isFavorite
          ? "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100"
          : "border-black/10 bg-white text-neutral-800 hover:bg-neutral-50",
        isPending ? "cursor-wait opacity-60" : "",
      ].join(" ")}
    >
      {isPending ? "更新中..." : isFavorite ? "★ お気に入り済み" : "☆ よく使うに保存"}
    </button>
  );
}

function TrackTags({
  track,
  isFavorite,
}: {
  track: BgmLibraryTrack;
  isFavorite: boolean;
}) {
  const tags = [
    isFavorite ? "お気に入り" : "",
    track.mood,
    track.useCase,
    track.loopable ? "ループ可" : "ループ不可",
    ...track.tags,
  ].filter((tag) => tag.trim().length > 0);

  return (
    <div className="flex min-w-0 flex-wrap gap-2">
      {tags.map((tag, index) => (
        <FilterBadge key={`${track.id}-${tag}-${index}`}>{tag}</FilterBadge>
      ))}
    </div>
  );
}

export default function BgmLibraryPageClient({
  tracks,
  isLoggedIn,
  initialFavoriteTrackIds,
}: {
  tracks: BgmLibraryTrack[];
  isLoggedIn: boolean;
  initialFavoriteTrackIds: string[];
}) {
  const [query, setQuery] = useState("");
  const [moodFilter, setMoodFilter] = useState("all");
  const [usageFilter, setUsageFilter] = useState("all");
  const [loopFilter, setLoopFilter] = useState<LoopFilter>("all");
  const [favoriteTrackIds, setFavoriteTrackIds] = useState(initialFavoriteTrackIds);
  const [pendingTrackId, setPendingTrackId] = useState("");
  const [expandedTrackId, setExpandedTrackId] = useState("");
  const [favoriteNotice, setFavoriteNotice] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const favoriteIdSet = useMemo(
    () => new Set(favoriteTrackIds),
    [favoriteTrackIds]
  );

  const moodOptions = useMemo(
    () => ["all", ...new Set(tracks.map((track) => track.mood))],
    [tracks]
  );

  const usageOptions = useMemo(
    () => ["all", ...new Set(tracks.map((track) => track.useCase))],
    [tracks]
  );

  const favoriteTracks = useMemo(() => {
    return sortBgmLibraryTracksByFavorites(tracks, favoriteTrackIds).filter((track) =>
      favoriteIdSet.has(track.id)
    );
  }, [favoriteIdSet, favoriteTrackIds, tracks]);

  const filteredTracks = useMemo(() => {
    const nextTracks = tracks.filter((track) => {
      const matchesMood = moodFilter === "all" || track.mood === moodFilter;
      const matchesUsage = usageFilter === "all" || track.useCase === usageFilter;

      return (
        matchesMood &&
        matchesUsage &&
        matchesLoopFilter(track, loopFilter) &&
        includesQuery(track, query)
      );
    });

    return sortBgmLibraryTracksByFavorites(nextTracks, favoriteTrackIds);
  }, [favoriteTrackIds, loopFilter, moodFilter, query, tracks, usageFilter]);

  async function handleToggleFavorite(trackId: string) {
    if (!isLoggedIn || pendingTrackId) {
      return;
    }

    const previousFavoriteTrackIds = favoriteTrackIds;
    const wasFavorite = previousFavoriteTrackIds.includes(trackId);
    const nextFavoriteTrackIds = wasFavorite
      ? previousFavoriteTrackIds.filter((id) => id !== trackId)
      : [...previousFavoriteTrackIds, trackId];

    setFavoriteTrackIds(nextFavoriteTrackIds);
    setPendingTrackId(trackId);
    setFavoriteNotice(null);

    try {
      const response = await fetch("/api/bgm-library/favorites", {
        method: wasFavorite ? "DELETE" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ trackId }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: unknown }
          | null;

        throw new Error(
          typeof payload?.error === "string" && payload.error.trim().length > 0
            ? payload.error
            : "お気に入りの更新に失敗した。"
        );
      }

      setFavoriteNotice({
        type: "success",
        message: wasFavorite
          ? "お気に入りから外した。"
          : "よく使うBGMに追加した。",
      });
    } catch (error) {
      setFavoriteTrackIds(previousFavoriteTrackIds);
      setFavoriteNotice({
        type: "error",
        message: getErrorMessage(error),
      });
    } finally {
      setPendingTrackId("");
    }
  }

  function toggleExpanded(trackId: string) {
    setExpandedTrackId((current) => (current === trackId ? "" : trackId));
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-white px-4 py-6 text-black sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-6xl">
        <div className="mb-4 text-sm text-neutral-500">
          <span className="text-neutral-700">BGM素材ページ</span>
        </div>

        <section className="rounded-[32px] border border-black/10 bg-white shadow-sm">
          <div className="border-b border-black/10 px-5 py-6 sm:px-8">
            <p className="text-xs tracking-[0.22em] text-neutral-500">
              LIB READ BGM LIBRARY
            </p>

            <h1 className="mt-3 text-3xl font-bold text-black sm:text-4xl">
              BGM素材を探す
            </h1>

            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                href="/"
                className="rounded-full border border-black/10 bg-white px-5 py-3 text-sm text-neutral-800 transition hover:bg-neutral-50"
              >
                ホームへ
              </Link>

              <Link
                href="/write"
                className="rounded-full border border-sky-200 bg-sky-50 px-5 py-3 text-sm font-semibold text-black transition hover:bg-sky-100"
              >
                投稿データベースへ
              </Link>
            </div>
          </div>

          <div className="grid gap-6 px-5 py-6 sm:px-8">
            {isLoggedIn ? (
              <section className="rounded-[28px] border border-black/10 bg-neutral-50 p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs tracking-[0.18em] text-neutral-500">
                      FAVORITES
                    </p>
                    <h2 className="mt-2 text-xl font-semibold text-black">
                      よく使うBGM
                    </h2>
                  </div>

                  <FilterBadge>{favoriteTracks.length}件</FilterBadge>
                </div>

                {favoriteNotice ? (
                  <div
                    className={[
                      "mt-4 rounded-2xl border px-4 py-3 text-sm",
                      favoriteNotice.type === "error"
                        ? "border-red-200 bg-red-50 text-red-700"
                        : "border-emerald-200 bg-emerald-50 text-emerald-700",
                    ].join(" ")}
                  >
                    {favoriteNotice.message}
                  </div>
                ) : null}

                {favoriteTracks.length > 0 ? (
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    {favoriteTracks.map((track) => {
                      const isFavorite = favoriteIdSet.has(track.id);

                      return (
                        <button
                          key={`favorite-${track.id}`}
                          type="button"
                          onClick={() => toggleExpanded(track.id)}
                          className="w-full min-w-0 rounded-2xl border border-black/10 bg-white p-4 text-left transition hover:bg-neutral-50"
                        >
                          <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                              <h3 className="break-words text-base font-semibold text-black">
                                {track.title}
                              </h3>
                              <div className="mt-3">
                                <TrackTags track={track} isFavorite={isFavorite} />
                              </div>
                            </div>

                            <span className="rounded-full border border-black/10 bg-neutral-50 px-3 py-1 text-xs text-neutral-500">
                              {expandedTrackId === track.id ? "閉じる" : "開く"}
                            </span>
                          </div>

                          {expandedTrackId === track.id ? (
                            <div className="mt-4 grid gap-4">
                              <audio
                                controls
                                preload="none"
                                src={track.audioPath}
                                className="w-full"
                                onClick={(event) => event.stopPropagation()}
                              >
                                お使いのブラウザは audio 要素に対応していません。
                              </audio>

                              <div className="flex flex-wrap gap-2">
                                <FavoriteButton
                                  isFavorite
                                  isPending={pendingTrackId === track.id}
                                  onClick={() => {
                                    void handleToggleFavorite(track.id);
                                  }}
                                />
                              </div>
                            </div>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="mt-4 rounded-2xl border border-dashed border-black/10 bg-white px-4 py-4 text-sm leading-7 text-neutral-500">
                    まだお気に入りはない。下の一覧からよく使うBGMを保存できる。
                  </div>
                )}
              </section>
            ) : (
              <section className="rounded-[28px] border border-black/10 bg-neutral-50 p-5 text-sm leading-7 text-neutral-600">
                ログイン中だけ、自分専用のお気に入りBGMを保存できる。
              </section>
            )}

            <section className="rounded-[28px] border border-black/10 bg-neutral-50 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs tracking-[0.18em] text-neutral-500">
                    FILTERS
                  </p>
                  <h2 className="mt-2 text-xl font-semibold text-black">
                    検索と絞り込み
                  </h2>
                </div>

                <FilterBadge>{filteredTracks.length}件ヒット</FilterBadge>
              </div>

              <div className="mt-5 grid gap-4 lg:grid-cols-[1.3fr_0.8fr_0.8fr_0.8fr]">
                <label className="grid gap-2">
                  <span className="text-sm text-neutral-700">検索</span>
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="タイトル / 雰囲気 / 用途 / タグで検索"
                    className="rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-black outline-none placeholder:text-neutral-500"
                  />
                </label>

                <label className="grid gap-2">
                  <span className="text-sm text-neutral-700">雰囲気</span>
                  <select
                    value={moodFilter}
                    onChange={(event) => setMoodFilter(event.target.value)}
                    className="rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-black outline-none"
                  >
                    {moodOptions.map((option) => (
                      <option key={option} value={option}>
                        {option === "all" ? "すべて" : option}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="grid gap-2">
                  <span className="text-sm text-neutral-700">用途</span>
                  <select
                    value={usageFilter}
                    onChange={(event) => setUsageFilter(event.target.value)}
                    className="rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-black outline-none"
                  >
                    {usageOptions.map((option) => (
                      <option key={option} value={option}>
                        {option === "all" ? "すべて" : option}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="grid gap-2">
                  <span className="text-sm text-neutral-700">ループ</span>
                  <select
                    value={loopFilter}
                    onChange={(event) => setLoopFilter(event.target.value as LoopFilter)}
                    className="rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-black outline-none"
                  >
                    {LOOP_FILTERS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="mt-4 flex flex-wrap gap-3">
                {isLoggedIn ? (
                  <FilterBadge>お気に入り {favoriteTrackIds.length}件</FilterBadge>
                ) : (
                  <FilterBadge>ログインでお気に入り保存</FilterBadge>
                )}
                <FilterBadge>お気に入り優先表示</FilterBadge>
              </div>
            </section>

            <section className="grid gap-3">
              {filteredTracks.length > 0 ? (
                filteredTracks.map((track) => {
                  const isFavorite = favoriteIdSet.has(track.id);
                  const expanded = expandedTrackId === track.id;

                  return (
                    <article
                      key={track.id}
                      className="w-full min-w-0 rounded-[24px] border border-black/10 bg-white p-4 shadow-sm"
                    >
                      <button
                        type="button"
                        onClick={() => toggleExpanded(track.id)}
                        className="block w-full min-w-0 text-left"
                      >
                        <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-xs tracking-[0.18em] text-neutral-500">
                              SITE BGM
                            </p>
                            <h2 className="mt-2 break-words text-lg font-semibold text-black">
                              {track.title}
                            </h2>

                            <div className="mt-3">
                              <TrackTags track={track} isFavorite={isFavorite} />
                            </div>
                          </div>

                          <span className="rounded-full border border-black/10 bg-neutral-50 px-3 py-1 text-xs text-neutral-500">
                            {expanded ? "閉じる" : "開く"}
                          </span>
                        </div>
                      </button>

                      {expanded ? (
                        <div className="mt-5 grid gap-4">
                          <div className="rounded-[20px] border border-black/10 bg-neutral-50 p-4">
                            <p className="text-sm font-semibold text-black">サイト内試聴</p>

                            <audio
                              controls
                              preload="none"
                              src={track.audioPath}
                              className="mt-4 w-full"
                            >
                              お使いのブラウザは audio 要素に対応していません。
                            </audio>
                          </div>

                          <div className="rounded-[20px] border border-black/10 bg-neutral-50 p-4 text-sm leading-7 text-neutral-700">
                            <p className="text-sm font-semibold text-black">素材情報</p>
                            <dl className="mt-3 grid gap-2 sm:grid-cols-2">
                              <div>
                                <dt className="text-neutral-500">用途</dt>
                                <dd>{track.useCase}</dd>
                              </div>
                              <div>
                                <dt className="text-neutral-500">長さ</dt>
                                <dd>{track.durationLabel}</dd>
                              </div>
                              <div>
                                <dt className="text-neutral-500">ループ</dt>
                                <dd>{track.loopable ? "ループ可" : "ループ不可"}</dd>
                              </div>
                              <div>
                                <dt className="text-neutral-500">利用ラベル</dt>
                                <dd>{track.rightsLabel}</dd>
                              </div>
                            </dl>
                          </div>

                          <div className="flex flex-wrap gap-2">
                            {isLoggedIn ? (
                              <FavoriteButton
                                isFavorite={isFavorite}
                                isPending={pendingTrackId === track.id}
                                onClick={() => {
                                  void handleToggleFavorite(track.id);
                                }}
                              />
                            ) : null}
                          </div>
                        </div>
                      ) : null}
                    </article>
                  );
                })
              ) : (
                <div className="rounded-[28px] border border-dashed border-black/10 bg-neutral-50 p-6 text-sm leading-7 text-neutral-500">
                  条件に一致するBGMがまだない。
                </div>
              )}
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}
