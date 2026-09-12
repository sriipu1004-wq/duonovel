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
import type { StoredWebSpeechDisplaySettings } from "@/lib/playback/webSpeechPreferences";
import { useUiLocale } from "@/i18n/UiLocaleProvider";
import { readerDictionaries } from "@/i18n/dictionaries/reader";

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
  displaySettings: StoredWebSpeechDisplaySettings;
};

import {
  claimLinkedScroll,
  invalidateLinkedScroll,
  pauseLinkedScrollForTap,
  syncOtherPaneScroll,
} from "@/lib/playback/bilingualScroll";

export type PaneSide = "source" | "target";

export type BilingualWordSelection = {
  segmentId: string;
  side: PaneSide;
  text: string;
  startOffset?: number;
};

export type BilingualWordInsight = BilingualWordSelection & {
  status: "loading" | "ready" | "error";
  expression?: string;
  contextualMeaning?: string;
  oppositeText?: string;
  partOfSpeech?: string;
  usageType?: string;
  note?: string;
  message?: string;
};

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
): Array<{ text: string; isWordLike: boolean; startOffset: number }> {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const segmenter = new Intl.Segmenter(language, { granularity: "word" });
    return Array.from(segmenter.segment(value)).map((item) => ({
      text: item.segment,
      startOffset: item.index,
      isWordLike: item.isWordLike === true,
    }));
  }

  let offset = 0;
  return (value.match(/[\p{L}\p{N}\p{M}]+|[^\p{L}\p{N}\p{M}]+/gu) ?? [value]).map((text) => {
    const token = { text, isWordLike: /[\p{L}\p{N}]/u.test(text), startOffset: offset };
    offset += text.length;
    return token;
  });
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
  displaySettings,
}: BilingualPaneProps) {
  const dictionary = readerDictionaries[useUiLocale()];
  const paragraphMap = new Map<number, BilingualSegment[]>();
  const scrollFrameRef = useRef<number | null>(null);
  const lastReportedPositionIdRef = useRef<string | null>(null);

  for (const segment of segments) {
    const current = paragraphMap.get(segment.paragraphIndex) ?? [];
    current.push(segment);
    paragraphMap.set(segment.paragraphIndex, current);
  }

  useEffect(() => {
    return () => {
      if (scrollFrameRef.current !== null) {
        window.cancelAnimationFrame(scrollFrameRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    invalidateLinkedScroll(container);
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => invalidateLinkedScroll(container));
    observer.observe(container);
    if (container.firstElementChild) observer.observe(container.firstElementChild);
    return () => observer.disconnect();
  }, [scrollRef, segments, displaySettings, selectedSegmentId]);

  function handleScroll(event: UIEvent<HTMLDivElement>) {
    const source = event.currentTarget;
    if (
      Boolean(source.dataset.bilingualSyncing) ||
      scrollFrameRef.current !== null
    ) {
      return;
    }

    scrollFrameRef.current = window.requestAnimationFrame(() => {
      scrollFrameRef.current = null;
      if (syncOtherPaneScroll(side, source)) return;
      const centeredId = findCenteredSegmentId(source);
      if (
        centeredId &&
        centeredId !== lastReportedPositionIdRef.current
      ) {
        lastReportedPositionIdRef.current = centeredId;
        onReadingPositionChange(centeredId);
      }
    });
  }

  function selectSentence(source: Element, segmentId: string) {
    pauseLinkedScrollForTap(source);
    lastReportedPositionIdRef.current = segmentId;
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
              ? dictionary.meaningLoading(wordInsight.text)
              : wordInsight.status === "ready"
                ? `${wordInsight.expression || wordInsight.text}：${wordInsight.contextualMeaning || wordInsight.oppositeText} ・ ${wordInsight.partOfSpeech}${wordInsight.usageType ? ` ・ ${wordInsight.usageType}` : ""}${wordInsight.note ? `（${wordInsight.note}）` : ""}`
                : wordInsight.message || dictionary.meaningFailed}
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
        onTouchMove={(event) => claimLinkedScroll(event.currentTarget, side)}
        onPointerMove={(event) => {
          if (event.buttons || event.pointerType === "touch") claimLinkedScroll(event.currentTarget, side);
        }}
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
        <article
          className="space-y-6 text-black"
          style={{
            fontSize: `${displaySettings.fontScale}rem`,
            lineHeight:
              displaySettings.lineHeight === "compact"
                ? 1.85
                : displaySettings.lineHeight === "wide"
                  ? 2.35
                  : 2.05,
          }}
        >
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
                      selectSentence(event.currentTarget, segment.id);
                    }}
                    onKeyDown={(event) => {
                      if (selected && onSelectWord) return;
                      if (event.key !== "Enter" && event.key !== " ") return;
                      event.preventDefault();
                      selectSentence(event.currentTarget, segment.id);
                    }}
                    className={[
                      "inline cursor-pointer rounded-md px-1 py-1 transition-colors duration-150",
                      !displaySettings.hideEffects && hovered && !selected
                        ? "bg-sky-50"
                        : displaySettings.hideEffects
                          ? ""
                          : "hover:bg-sky-50/80",
                      selected &&
                      displaySettings.showMarker &&
                      !displaySettings.hideEffects
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
                                  startOffset: token.startOffset,
                                });
                              }}
                              className="rounded underline decoration-transparent decoration-2 underline-offset-4 transition hover:bg-white/70 hover:decoration-sky-400 focus:bg-white/70 focus:outline-none focus:decoration-sky-500"
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
                        : segment.translatedText}
                    {side === "target" ? " " : null}
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
