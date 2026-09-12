"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type BilingualDemoSentence = {
  source: string;
  translation: string;
};

export const DEFAULT_BILINGUAL_DEMO_SENTENCES: BilingualDemoSentence[] = [
  {
    source: "The station clock had stopped at eleven forty-seven.",
    translation: "駅の時計は十一時四十七分で止まっていた。",
  },
  {
    source: "I had already missed the last train, yet someone was still standing beneath the departure board.",
    translation: "私はもう終電を逃していたのに、発車案内板の下にはまだ誰かが立っていた。",
  },
  {
    source: "A girl in a red scarf looked up from her book when she heard my footsteps.",
    translation: "赤いマフラーを巻いた少女が、私の足音を聞いて本から顔を上げた。",
  },
  {
    source: "“If you're waiting for the northbound train,” she said, “it won't come tonight.”",
    translation: "「北行きの列車を待っているなら」と彼女は言った。「今夜はもう来ないよ」",
  },
  {
    source: "I asked her how she knew, but she only closed the book and pointed toward the dark platform.",
    translation: "どうして分かるのかと尋ねると、彼女は本を閉じ、暗いホームの方を指しただけだった。",
  },
  {
    source: "Beyond the glass doors, a single lamp flickered beside the empty tracks.",
    translation: "ガラス扉の向こうでは、誰もいない線路のそばで一つの灯りだけが明滅していた。",
  },
  {
    source: "For a moment, I thought I heard the sound of wheels somewhere far inside the tunnel.",
    translation: "一瞬、トンネルのずっと奥から車輪の音が聞こえたような気がした。",
  },
  {
    source: "Then the lights on the platform came on one by one.",
    translation: "そのとき、ホームの照明が一つずつ点き始めた。",
  },
];

const DEFAULT_INSTRUCTION =
  "上下どちらかをスクロールすると対応位置が連動します。文をタップすると、対応する文が両方で反応し、それぞれの枠の中央付近へ移動します。";

type Pane = "source" | "translation";

type Props = {
  sourceLabel: string;
  translationLabel: string;
  sentences: BilingualDemoSentence[];
  instruction?: string;
  note: string;
};

function getSentenceCenters(
  container: HTMLDivElement,
  items: Array<HTMLButtonElement | null>,
) {
  const containerRect = container.getBoundingClientRect();

  return items.map((item) => {
    if (!item) return 0;
    const rect = item.getBoundingClientRect();
    return rect.top - containerRect.top + container.scrollTop + rect.height / 2;
  });
}

function mappedScrollTop(
  sourceContainer: HTMLDivElement,
  targetContainer: HTMLDivElement,
  sourceItems: Array<HTMLButtonElement | null>,
  targetItems: Array<HTMLButtonElement | null>,
) {
  const sourceCenters = getSentenceCenters(sourceContainer, sourceItems);
  const targetCenters = getSentenceCenters(targetContainer, targetItems);
  const viewportCenter = sourceContainer.scrollTop + sourceContainer.clientHeight / 2;

  if (sourceCenters.length === 0 || targetCenters.length === 0) {
    return { top: 0, activeIndex: 0 };
  }

  let lowerIndex = 0;

  for (let index = 0; index < sourceCenters.length - 1; index += 1) {
    if (viewportCenter >= sourceCenters[index]) {
      lowerIndex = index;
    }
    if (viewportCenter < sourceCenters[index + 1]) {
      break;
    }
  }

  const upperIndex = Math.min(lowerIndex + 1, sourceCenters.length - 1);
  const lowerCenter = sourceCenters[lowerIndex];
  const upperCenter = sourceCenters[upperIndex];
  const distance = upperCenter - lowerCenter;
  const progress = distance > 0 ? (viewportCenter - lowerCenter) / distance : 0;
  const clampedProgress = Math.max(0, Math.min(1, progress));

  const mappedCenter =
    targetCenters[lowerIndex] +
    (targetCenters[upperIndex] - targetCenters[lowerIndex]) * clampedProgress;
  const maxTop = Math.max(0, targetContainer.scrollHeight - targetContainer.clientHeight);
  const top = Math.max(
    0,
    Math.min(maxTop, mappedCenter - targetContainer.clientHeight / 2),
  );

  const activeIndex =
    Math.abs(viewportCenter - lowerCenter) <= Math.abs(viewportCenter - upperCenter)
      ? lowerIndex
      : upperIndex;

  return { top, activeIndex };
}

export default function InteractiveBilingualDemo({
  sourceLabel,
  translationLabel,
  sentences,
  instruction = DEFAULT_INSTRUCTION,
  note,
}: Props) {
  const [activeIndex, setActiveIndex] = useState(
    Math.min(1, Math.max(0, sentences.length - 1)),
  );
  const sourceContainerRef = useRef<HTMLDivElement>(null);
  const translationContainerRef = useRef<HTMLDivElement>(null);
  const sourceItemsRef = useRef<Array<HTMLButtonElement | null>>([]);
  const translationItemsRef = useRef<Array<HTMLButtonElement | null>>([]);
  const syncingRef = useRef(false);
  const releaseTimerRef = useRef<number | null>(null);

  const releaseSyncLock = useCallback((delay = 0) => {
    if (releaseTimerRef.current !== null) {
      window.clearTimeout(releaseTimerRef.current);
    }
    releaseTimerRef.current = window.setTimeout(() => {
      syncingRef.current = false;
      releaseTimerRef.current = null;
    }, delay);
  }, []);

  const centerSentence = useCallback(
    (index: number, behavior: ScrollBehavior = "smooth") => {
      const pairs = [
        {
          container: sourceContainerRef.current,
          item: sourceItemsRef.current[index],
        },
        {
          container: translationContainerRef.current,
          item: translationItemsRef.current[index],
        },
      ];

      syncingRef.current = true;

      pairs.forEach(({ container, item }) => {
        if (!container || !item) return;
        const containerRect = container.getBoundingClientRect();
        const itemRect = item.getBoundingClientRect();
        const center =
          itemRect.top -
          containerRect.top +
          container.scrollTop +
          itemRect.height / 2;
        const maxTop = Math.max(0, container.scrollHeight - container.clientHeight);
        const top = Math.max(
          0,
          Math.min(maxTop, center - container.clientHeight / 2),
        );
        container.scrollTo({ top, behavior });
      });

      releaseSyncLock(behavior === "smooth" ? 450 : 0);
    },
    [releaseSyncLock],
  );

  useEffect(() => {
    centerSentence(Math.min(1, Math.max(0, sentences.length - 1)), "auto");
    return () => {
      if (releaseTimerRef.current !== null) {
        window.clearTimeout(releaseTimerRef.current);
      }
    };
  }, [centerSentence, sentences.length]);

  const syncFrom = useCallback((pane: Pane) => {
    if (syncingRef.current) return;

    const sourceContainer =
      pane === "source" ? sourceContainerRef.current : translationContainerRef.current;
    const targetContainer =
      pane === "source" ? translationContainerRef.current : sourceContainerRef.current;
    const sourceItems =
      pane === "source" ? sourceItemsRef.current : translationItemsRef.current;
    const targetItems =
      pane === "source" ? translationItemsRef.current : sourceItemsRef.current;

    if (!sourceContainer || !targetContainer) return;

    const { top, activeIndex: nextIndex } = mappedScrollTop(
      sourceContainer,
      targetContainer,
      sourceItems,
      targetItems,
    );

    setActiveIndex(nextIndex);
    syncingRef.current = true;
    targetContainer.scrollTop = top;
    window.requestAnimationFrame(() => {
      syncingRef.current = false;
    });
  }, []);

  const handleSentenceClick = (index: number) => {
    setActiveIndex(index);
    centerSentence(index);
  };

  const renderPane = (
    pane: Pane,
    label: string,
    containerRef: typeof sourceContainerRef,
    itemsRef: typeof sourceItemsRef,
  ) => (
    <div className="min-w-0">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 sm:px-5">
        <p className="text-[11px] font-semibold tracking-[0.18em] text-neutral-300">
          {label}
        </p>
        <span className="rounded-full border border-white/10 px-2 py-1 text-[10px] text-neutral-400">
          SCROLL SYNC
        </span>
      </div>
      <div
        ref={containerRef}
        onScroll={() => syncFrom(pane)}
        className="h-56 overflow-y-auto overscroll-contain px-3 py-16 sm:h-64 sm:px-5 sm:py-20"
      >
        <div className="space-y-3">
          {sentences.map((sentence, index) => {
            const text = pane === "source" ? sentence.source : sentence.translation;
            const active = activeIndex === index;

            return (
              <button
                key={`${pane}-${index}`}
                ref={(node) => {
                  itemsRef.current[index] = node;
                }}
                type="button"
                aria-pressed={active}
                onClick={() => handleSentenceClick(index)}
                className={`block w-full rounded-2xl border px-4 py-4 text-left text-base leading-8 transition sm:px-5 sm:text-lg ${
                  active
                    ? "border-white/35 bg-white/15 text-white shadow-sm"
                    : "border-transparent text-neutral-200 hover:border-white/15 hover:bg-white/5"
                }`}
              >
                {text}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );

  return (
    <div className="mt-6 overflow-hidden rounded-[28px] border border-black/10 bg-neutral-950 shadow-sm">
      <div className="border-b border-white/10 px-4 py-3 text-xs leading-6 text-neutral-300 sm:px-5">
        {instruction}
      </div>
      <div className="divide-y divide-white/10">
        {renderPane(
          "source",
          sourceLabel,
          sourceContainerRef,
          sourceItemsRef,
        )}
        {renderPane(
          "translation",
          translationLabel,
          translationContainerRef,
          translationItemsRef,
        )}
      </div>
      <p className="border-t border-white/10 px-5 py-4 text-xs leading-6 text-neutral-300">
        {note}
      </p>
    </div>
  );
}
