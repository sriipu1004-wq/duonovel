"use client";

import type { RefObject, UIEvent } from "react";
import { renderTextWithAozoraRuby } from "@/features/effects/EffectPreviewRenderer";

export type BilingualSegment = {
  id: string;
  ja: string;
  en: string;
  paragraphIndex: number;
  sentenceIndex: number;
  startOffset: number;
  endOffset: number;
};

type BilingualPaneProps = {
  language: "ja" | "en";
  segments: BilingualSegment[];
  selectedSegmentId: string | null;
  scrollRef: RefObject<HTMLDivElement | null>;
  registerSegmentRef: (id: string, node: HTMLSpanElement | null) => void;
  onSelectSegment: (id: string) => void;
};

const TAP_CENTER_SYNC_PAUSE_MS = 800;

function findReaderRoot(source: Element): HTMLElement | null {
  const paneSection = source.closest("[data-bilingual-pane]");
  const readerRoot = paneSection?.parentElement;
  return readerRoot instanceof HTMLElement ? readerRoot : null;
}

function pauseLinkedScrollForTap(source: Element) {
  const readerRoot = findReaderRoot(source);
  if (!readerRoot) return;

  const token = `${Date.now()}-${Math.random()}`;
  readerRoot.dataset.bilingualTapCentering = token;

  window.setTimeout(() => {
    if (readerRoot.dataset.bilingualTapCentering === token) {
      delete readerRoot.dataset.bilingualTapCentering;
    }
  }, TAP_CENTER_SYNC_PAUSE_MS);
}

function syncOtherPaneScroll(
  language: "ja" | "en",
  event: UIEvent<HTMLDivElement>
) {
  const source = event.currentTarget;

  if (source.dataset.bilingualSyncing === "1") {
    return;
  }

  const readerRoot = findReaderRoot(source);
  if (!readerRoot || readerRoot.dataset.bilingualTapCentering) {
    return;
  }

  const targetLanguage = language === "ja" ? "en" : "ja";
  const target = readerRoot.querySelector<HTMLDivElement>(
    `[data-bilingual-scroll="${targetLanguage}"]`
  );

  if (!target || target === source) {
    return;
  }

  const sourceMaxScroll = Math.max(0, source.scrollHeight - source.clientHeight);
  const targetMaxScroll = Math.max(0, target.scrollHeight - target.clientHeight);
  const progress =
    sourceMaxScroll > 0
      ? Math.min(1, Math.max(0, source.scrollTop / sourceMaxScroll))
      : 0;

  target.dataset.bilingualSyncing = "1";
  target.scrollTop = progress * targetMaxScroll;

  window.requestAnimationFrame(() => {
    delete target.dataset.bilingualSyncing;
  });
}

export default function BilingualPane({
  language,
  segments,
  selectedSegmentId,
  scrollRef,
  registerSegmentRef,
  onSelectSegment,
}: BilingualPaneProps) {
  const paragraphMap = new Map<number, BilingualSegment[]>();

  for (const segment of segments) {
    const current = paragraphMap.get(segment.paragraphIndex) ?? [];
    current.push(segment);
    paragraphMap.set(segment.paragraphIndex, current);
  }

  return (
    <section
      data-bilingual-pane={language}
      className="flex min-h-0 flex-col overflow-hidden bg-white"
    >
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-black/10 bg-neutral-50 px-4">
        <span className="text-xs font-medium tracking-[0.14em] text-neutral-600">
          {language === "ja" ? "日本語" : "ENGLISH"}
        </span>
        <span className="text-[11px] text-neutral-400">
          スクロール・文タップ同期
        </span>
      </div>

      <div
        ref={scrollRef}
        data-bilingual-scroll={language}
        onScroll={(event) => syncOtherPaneScroll(language, event)}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6"
      >
        <article className="space-y-6 text-[1rem] leading-[2.05] text-black sm:text-[1.05rem]">
          {Array.from(paragraphMap.entries()).map(([paragraphIndex, paragraphSegments]) => (
            <p key={paragraphIndex} className="whitespace-pre-wrap">
              {paragraphSegments.map((segment) => {
                const active = selectedSegmentId === segment.id;
                return (
                  <span
                    key={segment.id}
                    ref={(node) => registerSegmentRef(segment.id, node)}
                    role="button"
                    tabIndex={0}
                    onClick={(event) => {
                      pauseLinkedScrollForTap(event.currentTarget);
                      onSelectSegment(segment.id);
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter" && event.key !== " ") return;
                      event.preventDefault();
                      pauseLinkedScrollForTap(event.currentTarget);
                      onSelectSegment(segment.id);
                    }}
                    className={[
                      "inline cursor-pointer rounded-md px-1 py-1 transition-all duration-150 hover:bg-sky-50/80",
                      active
                        ? "bg-sky-100 text-black shadow-[0_0_0_3px_rgba(186,230,253,0.55)]"
                        : "",
                    ].join(" ")}
                  >
                    {language === "ja"
                      ? renderTextWithAozoraRuby(segment.ja)
                      : `${segment.en} `}
                  </span>
                );
              })}
            </p>
          ))}
        </article>
      </div>
    </section>
  );
}
