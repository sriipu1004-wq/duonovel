"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { detectContentLanguage } from "@/i18n/contentLanguage";
import { useUiLocale } from "@/i18n/UiLocaleProvider";
import { localizePath } from "@/i18n/navigation";
import { localizeTagLabel } from "@/i18n/tagLabels";
import type { UiLocale } from "@/i18n/config";
import { parsePublicSearchReadLanguage } from "@/lib/search/publicWorkLanguageFilter";

type PublicWorkBoardCardProps = {
  title: string;
  workHref: string;
  authorName: string;
  authorHref?: string;
  latestPostedLabel: string;
  summary: string;
  firstReadHref?: string;
  tags: string[];
  viewCount?: number;
  likeCount?: number;
  bookmarkCount?: number;
  narrationPlayCount?: number;
};

const labels: Record<UiLocale, {
  noSummary: string;
  noTags: string;
  views: string;
  likes: string;
  bookmarks: string;
  narrationPlays: string;
  readFirst: string;
  unpublished: string;
}> = {
  ja: {
    noSummary: "あらすじ未設定",
    noTags: "タグ未設定",
    views: "閲覧",
    likes: "いいね",
    bookmarks: "ブックマーク",
    narrationPlays: "朗読再生",
    readFirst: "第1話から読む",
    unpublished: "未公開",
  },
  en: {
    noSummary: "No summary provided",
    noTags: "No tags",
    views: "Views",
    likes: "Likes",
    bookmarks: "Bookmarks",
    narrationPlays: "Narration plays",
    readFirst: "Read from episode 1",
    unpublished: "Unpublished",
  },
  ko: {
    noSummary: "줄거리 없음",
    noTags: "태그 없음",
    views: "조회",
    likes: "좋아요",
    bookmarks: "책갈피",
    narrationPlays: "낭독 재생",
    readFirst: "1화부터 읽기",
    unpublished: "비공개",
  },
};

function readSeriesIdFromWorkHref(workHref: string): string | null {
  const match = workHref.match(/^\/works\/([^/?#]+)/u);
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

function buildTagHref(tag: string, sourceLanguage: string | null, readLanguage: string | null): string {
  const query = new URLSearchParams();
  query.set("tag", tag);
  if (sourceLanguage) query.set("source_language", sourceLanguage);
  if (readLanguage) query.set("read_language", readLanguage);
  return `/search?${query.toString()}`;
}

export default function PublicWorkBoardCard({
  title,
  workHref,
  authorName,
  authorHref,
  latestPostedLabel,
  summary,
  firstReadHref,
  tags,
  viewCount,
  likeCount,
  bookmarkCount,
  narrationPlayCount,
}: PublicWorkBoardCardProps) {
  const locale = useUiLocale();
  const copy = labels[locale];
  const searchParams = useSearchParams();
  const [expanded, setExpanded] = useState(false);

  const visibleTags = useMemo(() => tags.slice(0, 3), [tags]);
  const contentLanguage = useMemo(
    () => detectContentLanguage(title, summary),
    [title, summary]
  );
  const readLanguage = parsePublicSearchReadLanguage(
    searchParams.get("read_language")
  );
  const sourceLanguage = searchParams.get("source_language")?.trim() || null;
  const seriesId = readSeriesIdFromWorkHref(workHref);
  const readIntentHref =
    readLanguage && seriesId
      ? `/read-intent/${encodeURIComponent(seriesId)}/${encodeURIComponent(readLanguage)}`
      : null;
  const resolvedWorkHref = readIntentHref ?? workHref;
  const resolvedFirstReadHref = readIntentHref ?? firstReadHref;

  const hasSummary = summary.trim().length > 0;
  const collapsedSummary = hasSummary ? summary.trim() : copy.noSummary;

  return (
    <article
      data-content-language={contentLanguage}
      className="rounded-[20px] border border-black/10 bg-white p-4"
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={localizePath(resolvedWorkHref, locale)}
              className="min-w-0 max-w-full truncate text-base font-semibold leading-tight text-black transition hover:opacity-70"
            >
              {title}
            </Link>

            {visibleTags.length > 0 ? (
              visibleTags.map((tag) => (
                <Link
                  key={tag}
                  href={localizePath(
                    buildTagHref(tag, sourceLanguage, readLanguage),
                    locale
                  )}
                  className="rounded-full border border-black/10 bg-neutral-50 px-2.5 py-1 text-[11px] text-neutral-600 transition hover:border-sky-200 hover:bg-sky-50 hover:text-black"
                >
                  {localizeTagLabel(tag, locale)}
                </Link>
              ))
            ) : (
              <span className="rounded-full border border-black/10 bg-neutral-50 px-2.5 py-1 text-[11px] text-neutral-500">
                {copy.noTags}
              </span>
            )}

            <span className="ml-auto shrink-0 rounded-full border border-black/10 bg-neutral-50 px-2.5 py-1 text-[11px] text-neutral-600">
              {latestPostedLabel}
            </span>
          </div>

          <div className="mt-2">
            {authorHref ? (
              <Link
                href={localizePath(authorHref, locale)}
                className="text-sm text-neutral-600 transition hover:text-black"
              >
                {authorName}
              </Link>
            ) : (
              <span className="text-sm text-neutral-600">{authorName}</span>
            )}
          </div>

          <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-neutral-500">
            {typeof viewCount === "number" ? (
              <span className="rounded-full border border-black/10 bg-neutral-50 px-2.5 py-1">
                {copy.views} {viewCount}
              </span>
            ) : null}

            {typeof likeCount === "number" ? (
              <span className="rounded-full border border-black/10 bg-neutral-50 px-2.5 py-1">
                {copy.likes} {likeCount}
              </span>
            ) : null}

            {typeof bookmarkCount === "number" ? (
              <span className="rounded-full border border-black/10 bg-neutral-50 px-2.5 py-1">
                {copy.bookmarks} {bookmarkCount}
              </span>
            ) : null}

            {typeof narrationPlayCount === "number" ? (
              <span className="rounded-full border border-black/10 bg-neutral-50 px-2.5 py-1">
                {copy.narrationPlays} {narrationPlayCount}
              </span>
            ) : null}
          </div>

          {!expanded ? (
            <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
              <button
                type="button"
                onClick={() => setExpanded(true)}
                className="min-w-0 truncate text-left text-sm leading-7 text-neutral-600"
                title={collapsedSummary}
              >
                {collapsedSummary}
                {hasSummary ? "…" : ""}
              </button>

              {resolvedFirstReadHref ? (
                <Link
                  href={localizePath(resolvedFirstReadHref, locale)}
                  className="shrink-0 rounded-full border border-black/10 bg-neutral-200 px-3.5 py-2 text-sm font-medium text-black transition hover:bg-neutral-300"
                >
                  {copy.readFirst}
                </Link>
              ) : (
                <span className="shrink-0 rounded-full border border-black/10 bg-neutral-50 px-3.5 py-2 text-sm text-neutral-500">
                  {copy.unpublished}
                </span>
              )}
            </div>
          ) : (
            <div className="mt-3">
              <button
                type="button"
                onClick={() => setExpanded(false)}
                className="block w-full whitespace-pre-wrap text-left text-sm leading-7 text-neutral-600"
              >
                {collapsedSummary}
              </button>

              <div className="mt-3 flex justify-end">
                {resolvedFirstReadHref ? (
                  <Link
                    href={localizePath(resolvedFirstReadHref, locale)}
                    className="rounded-full border border-black/10 bg-neutral-200 px-3.5 py-2 text-sm font-medium text-black transition hover:bg-neutral-300"
                  >
                    {copy.readFirst}
                  </Link>
                ) : (
                  <span className="rounded-full border border-black/10 bg-neutral-50 px-3.5 py-2 text-sm text-neutral-500">
                    {copy.unpublished}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
