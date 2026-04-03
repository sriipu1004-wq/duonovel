"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type PublicWorkBoardCardProps = {
  title: string;
  workHref: string;
  authorName: string;
  authorHref?: string;
  latestPostedLabel: string;
  summary: string;
  firstReadHref?: string;
  tags: string[];
};

function buildTagHref(tag: string): string {
  const query = new URLSearchParams();
  query.set("mode", "tag");
  query.set("tag", tag);
  return `/?${query.toString()}#results`;
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
}: PublicWorkBoardCardProps) {
  const [expanded, setExpanded] = useState(false);

  const visibleTags = useMemo(() => tags.slice(0, 3), [tags]);

  const hasSummary = summary.trim().length > 0;
  const collapsedSummary = hasSummary ? summary.trim() : "あらすじ未設定";

  return (
    <article className="rounded-[20px] border border-black/10 bg-white p-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={workHref}
              className="min-w-0 max-w-full truncate text-base font-semibold leading-tight text-black transition hover:opacity-70"
            >
              {title}
            </Link>

            {visibleTags.length > 0 ? (
              visibleTags.map((tag) => (
                <Link
                  key={tag}
                  href={buildTagHref(tag)}
                  className="rounded-full border border-black/10 bg-neutral-50 px-2.5 py-1 text-[11px] text-neutral-600 transition hover:border-sky-200 hover:bg-sky-50 hover:text-black"
                >
                  {tag}
                </Link>
              ))
            ) : (
              <span className="rounded-full border border-black/10 bg-neutral-50 px-2.5 py-1 text-[11px] text-neutral-500">
                タグ未設定
              </span>
            )}

            <span className="ml-auto shrink-0 rounded-full border border-black/10 bg-neutral-50 px-2.5 py-1 text-[11px] text-neutral-600">
              {latestPostedLabel}
            </span>
          </div>

          <div className="mt-2">
            {authorHref ? (
              <Link
                href={authorHref}
                className="text-sm text-neutral-600 transition hover:text-black"
              >
                {authorName}
              </Link>
            ) : (
              <span className="text-sm text-neutral-600">{authorName}</span>
            )}
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

              {firstReadHref ? (
                <Link
                  href={firstReadHref}
                  className="shrink-0 rounded-full border border-black/10 bg-neutral-200 px-3.5 py-2 text-sm font-medium text-black transition hover:bg-neutral-300"
                >
                  第1話から読む
                </Link>
              ) : (
                <span className="shrink-0 rounded-full border border-black/10 bg-neutral-50 px-3.5 py-2 text-sm text-neutral-500">
                  未公開
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
                {firstReadHref ? (
                  <Link
                    href={firstReadHref}
                    className="rounded-full border border-black/10 bg-neutral-200 px-3.5 py-2 text-sm font-medium text-black transition hover:bg-neutral-300"
                  >
                    第1話から読む
                  </Link>
                ) : (
                  <span className="rounded-full border border-black/10 bg-neutral-50 px-3.5 py-2 text-sm text-neutral-500">
                    未公開
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