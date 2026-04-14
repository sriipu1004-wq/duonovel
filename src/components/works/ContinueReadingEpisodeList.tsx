"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { getPlayLogBySeries } from "@/lib/playLogs";
import { supabase } from "@/lib/supabaseClient";

type EpisodeListItem = {
  id: string;
  episodeNumber: number;
  episodeTitle: string;
  postedDate: string;
  editedDate: string;
  href: string;
  readerAvailability?: "has_recording" | "no_recording" | null;
};

type ContinueReadingEpisodeListProps = {
  seriesId: string;
  episodes: EpisodeListItem[];
};

type BookmarkData = {
  seriesId: string;
  episodeNumber: number;
  currentTime: number;
  readerKey?: string;
  readerName?: string;
};

type ResumeData = {
  episodeNumber: number;
  startAt: number;
};

function toSafeNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value < 0 ? fallback : value;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || Number.isNaN(parsed)) {
    return fallback;
  }

  return parsed < 0 ? fallback : parsed;
}

function readLocalBookmark(seriesId: string): BookmarkData | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(`duonovel:bookmark:${seriesId}`);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as BookmarkData | null;
    if (!parsed || parsed.seriesId !== seriesId) return null;

    return parsed;
  } catch {
    return null;
  }
}

function readLocalResume(seriesId: string): ResumeData | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(`duonovel:read-progress:${seriesId}`);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as {
      episodeNumber?: unknown;
      positionSeconds?: unknown;
    } | null;

    if (!parsed) return null;

    const episodeNumber = Math.max(
      1,
      Math.floor(toSafeNumber(parsed.episodeNumber, 1))
    );
    const startAt = toSafeNumber(parsed.positionSeconds, 0);

    return {
      episodeNumber,
      startAt,
    };
  } catch {
    return null;
  }
}

export default function ContinueReadingEpisodeList({
  seriesId,
  episodes,
}: ContinueReadingEpisodeListProps) {
  const [loaded, setLoaded] = useState(false);
  const [resumeEpisodeNumber, setResumeEpisodeNumber] = useState<number | null>(null);
  const activeItemRef = useRef<HTMLAnchorElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadResume() {
      setLoaded(false);

      const localResume = readLocalResume(seriesId);
      const localBookmark = readLocalBookmark(seriesId);

      try {
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();

        if (authError) {
          throw authError;
        }

        if (user) {
          const { data: playLog, error } = await getPlayLogBySeries(supabase, {
            userId: user.id,
            seriesId,
          });

          if (error) {
            throw error;
          }

          if (!cancelled && playLog?.episode_number) {
            setResumeEpisodeNumber(playLog.episode_number);
            setLoaded(true);
            return;
          }
        }
      } catch {
        // noop
      }

      if (cancelled) return;

      if (localResume) {
        setResumeEpisodeNumber(localResume.episodeNumber);
        setLoaded(true);
        return;
      }

      if (localBookmark) {
        setResumeEpisodeNumber(
          Math.max(1, Math.floor(toSafeNumber(localBookmark.episodeNumber, 1)))
        );
        setLoaded(true);
        return;
      }

      setResumeEpisodeNumber(null);
      setLoaded(true);
    }

    void loadResume();

    return () => {
      cancelled = true;
    };
  }, [seriesId]);

  useEffect(() => {
    if (!loaded) return;
    if (!activeItemRef.current) return;

    activeItemRef.current.scrollIntoView({
      behavior: "smooth",
      block: "center",
      inline: "nearest",
    });
  }, [loaded, resumeEpisodeNumber]);

  const renderedEpisodes = useMemo(() => {
    return episodes.map((episode) => {
      const isContinueTarget =
        loaded && resumeEpisodeNumber !== null && episode.episodeNumber === resumeEpisodeNumber;

      return {
        ...episode,
        isContinueTarget,
      };
    });
  }, [episodes, loaded, resumeEpisodeNumber]);

  return (
    <div className="overflow-hidden rounded-[20px] border border-black/10">
      <div className="max-h-[760px] overflow-y-auto">
        <ul className="divide-y divide-black/10">
          {renderedEpisodes.map((episode) => (
            <li key={episode.id}>
              <Link
                href={episode.href}
                ref={episode.isContinueTarget ? activeItemRef : null}
                className={[
                  "group flex items-center justify-between gap-4 px-4 py-4 transition",
                  episode.isContinueTarget
                    ? "bg-sky-50 hover:bg-sky-100"
                    : "hover:bg-neutral-50",
                ].join(" ")}
              >
                <div className="min-w-0">
                  <div className="flex items-start gap-3">
                    <span
                      className={[
                        "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm",
                        episode.isContinueTarget
                          ? "border-sky-200 bg-white text-sky-700"
                          : "border-black/10 bg-white text-neutral-700",
                      ].join(" ")}
                    >
                      {episode.episodeNumber}
                    </span>

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p
                          className={[
                            "text-sm",
                            episode.isContinueTarget ? "text-sky-700" : "text-neutral-500",
                          ].join(" ")}
                        >
                          第{episode.episodeNumber}話
                        </p>

                        {episode.isContinueTarget ? (
                          <span className="rounded-full bg-sky-600 px-2.5 py-1 text-[11px] font-semibold text-white">
                            続きから読む
                          </span>
                        ) : null}
                      </div>

                      <p
                        className={[
                          "truncate text-base font-medium",
                          episode.isContinueTarget ? "text-sky-900" : "text-black",
                        ].join(" ")}
                      >
                        {episode.episodeTitle}
                      </p>

                      {episode.readerAvailability ? (
                        <div className="mt-2">
                          <span
                            className={[
                              "rounded-full border px-2.5 py-1 text-[11px]",
                              episode.readerAvailability === "has_recording"
                                ? "border-sky-200 bg-sky-50 text-black"
                                : "border-black/10 bg-neutral-100 text-neutral-600",
                            ].join(" ")}
                          >
                            {episode.readerAvailability === "has_recording"
                              ? "朗読あり"
                              : "朗読なし"}
                          </span>
                        </div>
                      ) : null}

                      <p className="mt-1 text-xs text-neutral-500">
                        {episode.postedDate ? `投稿日 ${episode.postedDate}` : "投稿日 未設定"}
                        {episode.editedDate ? `（${episode.editedDate} 編集済み）` : ""}
                      </p>
                    </div>
                  </div>
                </div>

                <div
                  className={[
                    "shrink-0 rounded-full px-3.5 py-2 text-sm transition",
                    episode.isContinueTarget
                      ? "border border-sky-200 bg-white text-sky-700"
                      : "border border-black/10 bg-white text-neutral-700 group-hover:border-sky-200 group-hover:bg-sky-50 group-hover:text-black",
                  ].join(" ")}
                >
                  読む
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}