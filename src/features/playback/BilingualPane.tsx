"use client";

import {
  useEffect,
  useRef,
  useState,
  type RefObject,
  type UIEvent,
} from "react";
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
  hoveredSegmentId: string | null;
  scrollRef: RefObject<HTMLDivElement | null>;
  registerSegmentRef: (id: string, node: HTMLSpanElement | null) => void;
  onSelectSegment: (id: string) => void;
  onHoverSegment: (id: string | null) => void;
  onReadingPositionChange: (id: string) => void;
};

type WordLookup = {
  segmentId: string;
  word: string;
};

const TAP_CENTER_SYNC_PAUSE_MS = 800;
const ENGLISH_WORD_PATTERN = /^[A-Za-z]+(?:['’][A-Za-z]+)*$/u;

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

function findCenteredSegmentId(container: HTMLDivElement): string | null {
  const segments = Array.from(
    container.querySelectorAll<HTMLElement>("[data-bilingual-segment-id]")
  );

  if (segments.length === 0) return null;

  const containerRect = container.getBoundingClientRect();
  const centerY = containerRect.top + containerRect.height / 2;
  let bestId: string | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const segment of segments) {
    const rect = segment.getBoundingClientRect();

    if (rect.bottom < containerRect.top || rect.top > containerRect.bottom) {
      continue;
    }

    const segmentCenter = rect.top + rect.height / 2;
    const distance = Math.abs(segmentCenter - centerY);

    if (distance < bestDistance) {
      bestDistance = distance;
      bestId = segment.dataset.bilingualSegmentId ?? null;
    }
  }

  return bestId;
}

function splitEnglishText(text: string): string[] {
  return text.split(/([A-Za-z]+(?:['’][A-Za-z]+)*)/gu).filter(Boolean);
}

export default function BilingualPane({
  language,
  segments,
  selectedSegmentId,
  hoveredSegmentId,
  scrollRef,
  registerSegmentRef,
  onSelectSegment,
  onHoverSegment,
  onReadingPositionChange,
}: BilingualPaneProps) {
  const paragraphMap = new Map<number, BilingualSegment[]>();
  const positionFrameRef = useRef<number | null>(null);
  const [wordLookup, setWordLookup] = useState<WordLookup | null>(null);

  for (const segment of segments) {
    const current = paragraphMap.get(segment.paragraphIndex) ?? [];
    current.push(segment);
    paragraphMap.set(segment.paragraphIndex, current);
  }

  const wordLookupSegment = wordLookup
    ? segments.find((segment) => segment.id === wordLookup.segmentId) ?? null
    : null;

  useEffect(() => {
    return () => {
      if (positionFrameRef.current !== null) {
        window.cancelAnimationFrame(positionFrameRef.current);
      }
    };
  }, []);

  function handleScroll(event: UIEvent<HTMLDivElement>) {
    const source = event.currentTarget;
    const isProgrammaticCounterpart = source.dataset.bilingualSyncing === "1";

    syncOtherPaneScroll(language, event);

    if (isProgrammaticCounterpart || positionFrameRef.current !== null) return;

    positionFrameRef.current = window.requestAnimationFrame(() => {
      positionFrameRef.current = null;
      const centeredId = findCenteredSegmentId(source);
      if (centeredId) onReadingPositionChange(centeredId);
    });
  }

  function selectSentence(source: Element, segmentId: string) {
    pauseLinkedScrollForTap(source);
    onReadingPositionChange(segmentId);
    onSelectSegment(segmentId);
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
          {language === "en" ? "文同期・単語タップ" : "文同期"}
        </span>
      </div>

      {language === "en" && wordLookup && wordLookupSegment ? (
        <div className="shrink-0 border-b border-sky-200 bg-sky-50/70 px-4 py-3 sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-semibold tracking-[0.08em] text-sky-700">
                {wordLookup.word}
              </p>
              <p className="mt-1 text-[11px] text-neutral-500">
                この単語を含む文の日本語対訳
              </p>
              <p className="mt-2 text-sm leading-6 text-black">
                {wordLookupSegment.ja}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setWordLookup(null)}
              className="shrink-0 rounded-full border border-black/10 bg-white px-2 py-1 text-xs text-neutral-500 hover:bg-neutral-50"
              aria-label="単語対訳を閉じる"
            >
              ×
            </button>
          </div>
        </div>
      ) : null}

      <div
        ref={scrollRef}
        data-bilingual-scroll={language}
        onScroll={handleScroll}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6"
      >
        <article className="space-y-6 text-[1rem] leading-[2.05] text-black sm:text-[1.05rem]">
          {Array.from(paragraphMap.entries()).map(([paragraphIndex, paragraphSegments]) => (
            <p key={paragraphIndex} className="whitespace-pre-wrap">
              {paragraphSegments.map((segment) => {
                const selected = selectedSegmentId === segment.id;
                const hovered = hoveredSegmentId === segment.id;

                return (
                  <span
                    key={segment.id}
                    data-bilingual-segment-id={segment.id}
                    ref={(node) => registerSegmentRef(segment.id, node)}
                    role="button"
                    tabIndex={0}
                    onMouseEnter={() => onHoverSegment(segment.id)}
                    onMouseLeave={() => onHoverSegment(null)}
                    onClick={(event) => {
                      selectSentence(event.currentTarget, segment.id);
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter" && event.key !== " ") return;
                      event.preventDefault();
                      selectSentence(event.currentTarget, segment.id);
                    }}
                    className={[
                      "inline cursor-pointer rounded-md px-1 py-1 transition-all duration-150",
                      hovered && !selected
                        ? "bg-sky-50 underline decoration-sky-400 decoration-2 underline-offset-4"
                        : "hover:bg-sky-50/80",
                      selected
                        ? "bg-sky-100 text-black shadow-[0_0_0_3px_rgba(186,230,253,0.55)] underline decoration-sky-500 decoration-2 underline-offset-4"
                        : "",
                    ].join(" ")}
                  >
                    {language === "ja"
                      ? renderTextWithAozoraRuby(segment.ja)
                      : splitEnglishText(segment.en).map((token, tokenIndex) =>
                          ENGLISH_WORD_PATTERN.test(token) ? (
                            <span
                              key={`${segment.id}-word-${tokenIndex}`}
                              role="button"
                              tabIndex={0}
                              className="rounded-sm border-b border-transparent px-0.5 hover:border-sky-500 hover:bg-sky-100"
                              onClick={(event) => {
                                event.stopPropagation();
                                selectSentence(event.currentTarget, segment.id);
                                setWordLookup({ segmentId: segment.id, word: token });
                              }}
                              onKeyDown={(event) => {
                                if (event.key !== "Enter" && event.key !== " ") return;
                                event.preventDefault();
                                event.stopPropagation();
                                selectSentence(event.currentTarget, segment.id);
                                setWordLookup({ segmentId: segment.id, word: token });
                              }}
                            >
                              {token}
                            </span>
                          ) : (
                            <span key={`${segment.id}-text-${tokenIndex}`}>{token}</span>
                          )
                        )}
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
