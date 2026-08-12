"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
  type UIEvent,
} from "react";
import { renderTextWithAozoraRuby } from "@/features/effects/EffectPreviewRenderer";
import BilingualWordBubble, {
  type BilingualWordLookup,
} from "@/features/playback/BilingualWordBubble";

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

const TAP_CENTER_SYNC_PAUSE_MS = 800;
const ENGLISH_WORD_SPLIT_PATTERN =
  /([A-Za-z]+(?:['’][A-Za-z]+)*(?:-[A-Za-z]+(?:['’][A-Za-z]+)*)*)/g;
const ENGLISH_WORD_PATTERN =
  /^[A-Za-z]+(?:['’][A-Za-z]+)*(?:-[A-Za-z]+(?:['’][A-Za-z]+)*)*$/;

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
  const [wordLookup, setWordLookup] = useState<BilingualWordLookup | null>(null);
  const closeWordLookup = useCallback(() => setWordLookup(null), []);

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
    const isProgrammaticCounterpart = source.dataset.bilingualSyncing === "1";

    closeWordLookup();

    syncOtherPaneScroll(language, event);

    if (isProgrammaticCounterpart || positionFrameRef.current !== null) return;

    positionFrameRef.current = window.requestAnimationFrame(() => {
      positionFrameRef.current = null;
      const centeredId = findCenteredSegmentId(source);
      if (centeredId) onReadingPositionChange(centeredId);
    });
  }

  function selectSentence(source: Element, segmentId: string) {
    closeWordLookup();
    pauseLinkedScrollForTap(source);
    onReadingPositionChange(segmentId);
    onSelectSegment(segmentId);
  }

  function openWordLookup(wordElement: HTMLElement, segmentId: string) {
    const rect = wordElement.getBoundingClientRect();
    const viewportWidth = document.documentElement.clientWidth;
    const bubbleHalfWidth = Math.min(144, Math.max(0, (viewportWidth - 24) / 2));
    const minimumAnchorX = 12 + bubbleHalfWidth;
    const maximumAnchorX = viewportWidth - 12 - bubbleHalfWidth;

    setWordLookup({
      segmentId,
      word: wordElement.dataset.bilingualWord ?? wordElement.textContent ?? "",
      anchorX: Math.min(
        maximumAnchorX,
        Math.max(minimumAnchorX, rect.left + rect.width / 2)
      ),
      anchorTop: rect.top,
      anchorBottom: rect.bottom,
    });
  }

  function renderEnglishWords(text: string, interactive: boolean) {
    return text.split(ENGLISH_WORD_SPLIT_PATTERN).map((part, index) =>
      ENGLISH_WORD_PATTERN.test(part) ? (
        <span
          key={`${index}-${part}`}
          data-bilingual-word={part}
          className={
            interactive
              ? "rounded-sm transition-colors hover:bg-sky-200/80 active:bg-sky-300/80"
              : undefined
          }
        >
          {part}
        </span>
      ) : (
        part
      )
    );
  }

  return (
    <section
      data-bilingual-pane={language}
      className="flex min-h-0 flex-col overflow-hidden bg-white"
    >
      <div className="flex h-10 shrink-0 items-center border-b border-black/10 bg-neutral-50 px-4">
        <span className="text-xs font-medium tracking-[0.14em] text-neutral-600">
          {language === "ja" ? "日本語" : "ENGLISH"}
        </span>
      </div>

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
                      const target = event.target;
                      const wordElement =
                        target instanceof Element
                          ? target.closest<HTMLElement>("[data-bilingual-word]")
                          : null;

                      if (
                        language === "en" &&
                        selected &&
                        wordElement &&
                        event.currentTarget.contains(wordElement)
                      ) {
                        openWordLookup(wordElement, segment.id);
                        return;
                      }

                      if (selected) return;
                      selectSentence(event.currentTarget, segment.id);
                    }}
                    onKeyDown={(event) => {
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
                    {language === "ja"
                      ? renderTextWithAozoraRuby(segment.ja)
                      : <>{renderEnglishWords(segment.en, selected)} </>}
                  </span>
                );
              })}
            </p>
          ))}
        </article>
      </div>

      {language === "en" &&
      wordLookup &&
      selectedSegmentId === wordLookup.segmentId ? (
        <BilingualWordBubble
          key={`${wordLookup.segmentId}:${wordLookup.word}`}
          lookup={wordLookup}
          onClose={closeWordLookup}
        />
      ) : null}
    </section>
  );
}
