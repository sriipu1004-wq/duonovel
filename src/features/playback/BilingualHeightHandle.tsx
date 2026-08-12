"use client";

import {
  useRef,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";

type BilingualHeightHandleProps = {
  readerRef: RefObject<HTMLDivElement | null>;
  readerHeight: number | null;
  onReaderHeightChange: (height: number) => void;
};

export const MIN_BILINGUAL_READER_HEIGHT = 320;
export const MAX_BILINGUAL_READER_HEIGHT = 1440;

export function clampBilingualReaderHeight(value: number): number {
  if (!Number.isFinite(value)) return MIN_BILINGUAL_READER_HEIGHT;
  return Math.min(
    MAX_BILINGUAL_READER_HEIGHT,
    Math.max(MIN_BILINGUAL_READER_HEIGHT, value)
  );
}

export default function BilingualHeightHandle({
  readerRef,
  readerHeight,
  onReaderHeightChange,
}: BilingualHeightHandleProps) {
  const draggingRef = useRef(false);
  const startClientYRef = useRef(0);
  const startHeightRef = useRef(0);

  function currentHeight(): number {
    return clampBilingualReaderHeight(
      readerHeight ?? readerRef.current?.getBoundingClientRect().height ?? 0
    );
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    const reader = readerRef.current;
    if (!reader) return;

    event.preventDefault();
    draggingRef.current = true;
    startClientYRef.current = event.clientY;
    startHeightRef.current = reader.getBoundingClientRect().height;
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!draggingRef.current) return;

    event.preventDefault();
    onReaderHeightChange(
      clampBilingualReaderHeight(
        startHeightRef.current + event.clientY - startClientYRef.current
      )
    );
  }

  function handlePointerEnd(event: ReactPointerEvent<HTMLDivElement>) {
    draggingRef.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;

    event.preventDefault();
    const direction = event.key === "ArrowUp" ? -1 : 1;
    onReaderHeightChange(
      clampBilingualReaderHeight(currentHeight() + direction * 32)
    );
  }

  return (
    <div
      role="separator"
      tabIndex={0}
      aria-label="対訳表示全体の高さ"
      aria-orientation="horizontal"
      aria-valuemin={MIN_BILINGUAL_READER_HEIGHT}
      aria-valuemax={MAX_BILINGUAL_READER_HEIGHT}
      aria-valuenow={
        readerHeight === null ? undefined : Math.round(readerHeight)
      }
      title="上下にドラッグして対訳表示の高さを変更"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onKeyDown={handleKeyDown}
      className="relative z-30 flex h-8 cursor-ns-resize touch-none select-none items-center justify-center border-t border-black/10 bg-neutral-50 outline-none focus-visible:bg-sky-50"
    >
      <span className="h-1.5 w-12 rounded-full bg-black/20" />
    </div>
  );
}
