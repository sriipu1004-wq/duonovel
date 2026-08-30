"use client";

import {
  useEffect,
  useRef,
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
  type UIEvent,
  type WheelEvent,
} from "react";
import { renderTextWithAozoraRuby } from "@/features/effects/EffectPreviewRenderer";
import type { SupportedLanguageTag } from "@/lib/translation/languageRegistry";

export type BilingualSegment = {
  id: string;
  sourceText: string;
  translatedText: string;
  paragraphIndex: number;
  sentenceIndex: number;
  startOffset: number;
  endOffset: number;
};

type BilingualPaneProps = {
  side: PaneSide;
  languageLabel: string;
  languageTag?: SupportedLanguageTag;
  segments: BilingualSegment[];
  selectedSegmentId: string | null;
  hoveredSegmentId: string | null;
  scrollRef: RefObject<HTMLDivElement | null>;
  registerSegmentRef: (id: string, node: HTMLSpanElement | null) => void;
  onSelectSegment: (id: string) => void;
  onHoverSegment: (id: string | null) => void;
  onReadingPositionChange: (id: string) => void;
  onSelectWord?: (selection: BilingualWordSelection) => void;
  wordInsight?: BilingualWordInsight | null;
};

const TAP_CENTER_SYNC_PAUSE_MS = 800;
const SCROLL_OWNER_RELEASE_MS = 800;

export type PaneSide = "source" | "target";

export type BilingualWordSelection = {
  segmentId: string;
  side: PaneSide;
  text: string;
};

export type BilingualWordInsight = BilingualWordSelection & {
  status: "loading" | "ready" | "error";
  oppositeText?: string;
  partOfSpeech?: string;
  note?: string;
  message?: string;
};

type LinkedScrollState = {
  owner: PaneSide | null;
  releaseTimer: number | null;
};

const linkedScrollStates = new WeakMap<HTMLElement, LinkedScrollState>();

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

function getLinkedScrollState(readerRoot: HTMLElement): LinkedScrollState {
  const current = linkedScrollStates.get(readerRoot);
  if (current) return current;

  const created: LinkedScrollState = {
    owner: null,
    releaseTimer: null,
  };
  linkedScrollStates.set(readerRoot, created);
  return created;
}

function claimLinkedScroll(source: Element, side: PaneSide) {
  const readerRoot = findReaderRoot(source);
  if (!readerRoot) return;

  const state = getLinkedScrollState(readerRoot);
  if (state.releaseTimer !== null) {
    window.clearTimeout(state.releaseTimer);
    state.releaseTimer = null;
  }
  state.owner = side;
  delete (source as HTMLElement).dataset.bilingualSyncing;
}

function scheduleLinkedScrollRelease(
  readerRoot: HTMLElement,
  side: PaneSide
) {
  const state = getLinkedScrollState(readerRoot);
  if (state.releaseTimer !== null) {
    window.clearTimeout(state.releaseTimer);
  }

  state.releaseTimer = window.setTimeout(() => {
    if (state.owner === side) {
      state.owner = null;
    }
    state.releaseTimer = null;
  }, SCROLL_OWNER_RELEASE_MS);
}

function syncOtherPaneScroll(
  side: PaneSide,
  event: UIEvent<HTMLDivElement>
): boolean {
  const source = event.currentTarget;

  if (source.dataset.bilingualSyncing === "1") {
    return true;
  }

  const readerRoot = findReaderRoot(source);
  if (!readerRoot || readerRoot.dataset.bilingualTapCentering) {
    return true;
  }

  const state = getLinkedScrollState(readerRoot);
  if (state.owner !== null && state.owner !== side) {
    return true;
  }
  state.owner = side;

  const targetSide = side === "source" ? "target" : "source";
  const target = readerRoot.querySelector<HTMLDivElement>(
    `[data-bilingual-scroll="${targetSide}"]`
  );

  if (!target || target === source) {
    scheduleLinkedScrollRelease(readerRoot, side);
    return false;
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

  scheduleLinkedScrollRelease(readerRoot, side);
  return false;
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

function tokenizeForWordSelection(
  value: string,
  language?: SupportedLanguageTag
): Array<{ text: string; isWordLike: boolean }> {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const segmenter = new Intl.Segmenter(language, { granularity: "word" });
    return Array.from(segmenter.segment(value)).map((item) => ({
      text: item.segment,
      isWordLike: item.isWordLike === true,
    }));
  }

  return (value.match(/[\p{L}\p{N}\p{M}]+|[^\p{L}\p{N}\p{M}]+/gu) ?? [value]).map(
    (text) => ({ text, isWordLike: /[\p{L}\p{N}]/u.test(text) })
  );
}

export default function BilingualPane({
  side,
  languageLabel,
  languageTag,
  segments,
  selectedSegmentId,
  hoveredSegmentId,
  scrollRef,
  registerSegmentRef,
  onSelectSegment,
  onHoverSegment,
  onReadingPositionChange,
  onSelectWord,
  wordInsight,
}: BilingualPaneProps) {
  const paragraphMap = new Map<number, BilingualSegment[]>();
  const positionFrameRef = useRef<number | null>(null);

  for (const segment of segments) {
    const current = paragraphMap.get(segment.paragraphIndex) ?? [];
    current.push(segment);
    paragraphMap.set(segment.paragraphIndex, current);
  }

  useEffect(() => {
    return () => {
      if (positionFrameRef.current !== null) {
        window.cancelAnimationFrame(positionFrameRef.current);
      }
    };
  }, []);

  function handleScroll(event: UIEvent<HTMLDivElement>) {
    const source = event.currentTarget;
    const isProgrammaticCounterpart = syncOtherPaneScroll(side, event);

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
      data-bilingual-pane={side}
      className="flex min-h-0 flex-col overflow-hidden bg-white"
    >
      <div className="flex min-h-10 shrink-0 items-center justify-between gap-3 border-b border-black/10 bg-neutral-50 px-4 py-2">
        <span className="text-xs font-medium tracking-[0.14em] text-neutral-600">
          {languageLabel}
        </span>
        {wordInsight?.side === side ? (
          <span className="min-w-0 text-right text-[11px] leading-5 text-neutral-600">
            {wordInsight.status === "loading"
              ? `${wordInsight.text} の対応を確認中…`
              : wordInsight.status === "ready"
                ? `${wordInsight.text} → ${wordInsight.oppositeText} ・ ${wordInsight.partOfSpeech}`
                : wordInsight.message || "単語の対応を確認できませんでした"}
          </span>
        ) : null}
      </div>

      <div
        ref={scrollRef}
        data-bilingual-scroll={side}
        onPointerDown={(event: PointerEvent<HTMLDivElement>) =>
          claimLinkedScroll(event.currentTarget, side)
        }
        onTouchStart={(event) =>
          claimLinkedScroll(event.currentTarget, side)
        }
        onWheel={(event: WheelEvent<HTMLDivElement>) =>
          claimLinkedScroll(event.currentTarget, side)
        }
        onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
          if (
            event.key === "ArrowUp" ||
            event.key === "ArrowDown" ||
            event.key === "PageUp" ||
            event.key === "PageDown" ||
            event.key === "Home" ||
            event.key === "End" ||
            event.key === " "
          ) {
            claimLinkedScroll(event.currentTarget, side);
          }
        }}
        onScroll={handleScroll}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6"
      >
        <article className="space-y-6 text-[1rem] leading-[2.05] text-black sm:text-[1.05rem]">
          {Array.from(paragraphMap.entries()).map(
            ([paragraphIndex, paragraphSegments], index, paragraphs) => {
              const firstSource = paragraphSegments[0]?.sourceText.trim() ?? "";
              const previousSource =
                paragraphs[index - 1]?.[1]?.[0]?.sourceText.trim() ?? "";
              const followsDialogue =
                /^[「『]/u.test(firstSource) && /^[「『]/u.test(previousSource);

              return (
                <p
                  key={paragraphIndex}
                  className={
                    followsDialogue
                      ? "!mt-0 whitespace-pre-wrap"
                      : "whitespace-pre-wrap"
                  }
                >
              {paragraphSegments.map((segment) => {
                const selected = selectedSegmentId === segment.id;
                const hovered = hoveredSegmentId === segment.id;

                return (
                  <span
                    key={segment.id}
                    data-bilingual-segment-id={segment.id}
                    ref={(node) => registerSegmentRef(segment.id, node)}
                    role={selected && onSelectWord ? undefined : "button"}
                    tabIndex={selected && onSelectWord ? undefined : 0}
                    onMouseEnter={() => onHoverSegment(segment.id)}
                    onMouseLeave={() => onHoverSegment(null)}
                    onClick={(event) => {
                      if (selected) return;
                      selectSentence(event.currentTarget, segment.id);
                    }}
                    onKeyDown={(event) => {
                      if (selected && onSelectWord) return;
                      if (event.key !== "Enter" && event.key !== " ") return;
                      event.preventDefault();
                      selectSentence(event.currentTarget, segment.id);
                    }}
                    className={[
                      "inline cursor-pointer rounded-md px-1 py-1 transition-all duration-150",
                      hovered && !selected ? "bg-sky-50" : "hover:bg-sky-50/80",
                      selected
                        ? "bg-sky-100 text-black shadow-[0_0_0_3px_rgba(186,230,253,0.55)]"
                        : "",
                    ].join(" ")}
                  >
                    {selected && onSelectWord
                      ? tokenizeForWordSelection(
                          side === "source"
                            ? segment.sourceText
                            : segment.translatedText,
                          languageTag
                        ).map((token, tokenIndex) =>
                          token.isWordLike ? (
                            <button
                              key={`${segment.id}-word-${tokenIndex}`}
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                onSelectWord({
                                  segmentId: segment.id,
                                  side,
                                  text: token.text,
                                });
                              }}
                              className="rounded px-0.5 underline decoration-transparent decoration-2 underline-offset-4 transition hover:bg-white/70 hover:decoration-sky-400 focus:bg-white/70 focus:outline-none focus:decoration-sky-500"
                            >
                              {token.text}
                            </button>
                          ) : (
                            <span key={`${segment.id}-text-${tokenIndex}`}>
                              {token.text}
                            </span>
                          )
                        )
                      : side === "source"
                        ? renderTextWithAozoraRuby(segment.sourceText)
                        : `${segment.translatedText} `}
                  </span>
                );
              })}
                </p>
              );
            }
          )}
        </article>
      </div>
    </section>
  );
}
